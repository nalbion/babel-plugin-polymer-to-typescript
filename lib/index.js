/// <reference path="node.d.ts" />
require('source-map-support').install();
var fs = require('fs');
function default_1(_a) {
    var t = _a.types;
    var start = -1, observers = {}, listeners = {}, postConstuctSetters = {};
    function toDashCase(str) {
        return str.replace(/([a-z]+)([A-Z])/g, function ($0, $1, $2) { return $1 + '-' + $2; }).toLowerCase();
    }
    function toUpperCamel(str) {
        return str.replace(/^[a-z]|(\-[a-z])/g, function ($1) { return $1.toUpperCase().replace('-', ''); });
    }
    function createDecorator(name, value) {
        return t.decorator(t.callExpression(t.identifier(name), [typeof value == 'string' ? t.stringLiteral(value) : value]));
    }
    function createDecoratorProperty(key, value) {
        //console.info('----------------- createDecoratorProperty:', value)    ;
        //console.info('ttttttttttttttttt type:', typeof value);
        switch (typeof value) {
            case 'object':
                return t.objectProperty(t.identifier(key), value);
            case 'boolean':
                value = value.toString();
        }
        return t.objectProperty(t.identifier(key), t.identifier(value));
    }
    /** @param type - one of Boolean, Date, Number, String, Array or Object */
    function createTypeAnnotation(type, name, elementType) {
        if (elementType === void 0) { elementType = 'any'; }
        if (!type) {
            console.info('!!!!!!!!!!!!!!!!!! no type for', name);
            return;
        }
        switch (type.toLowerCase()) {
            case 'string':
                return t.typeAnnotation(t.stringTypeAnnotation());
            case 'boolean':
                // return t.typeAnnotation(t.booleanTypeAnnotation());
                return t.typeAnnotation(t.genericTypeAnnotation(t.identifier('boolean')));
            case 'date':
                return t.typeAnnotation(t.dateTypeAnnotation());
            case 'number':
                return t.typeAnnotation(t.numberTypeAnnotation());
            case 'array':
                return t.typeAnnotation(t.arrayTypeAnnotation(t.identifier(elementType)));
            case 'object':
            default:
                if (name) {
                    var guessedType = guessTypeFromName(name);
                    if (guessedType) {
                        return createTypeAnnotation(guessedType);
                    }
                }
                return t.typeAnnotation(t.genericTypeAnnotation(t.identifier(type)));
        }
    }
    function parsePolymerFunctionSignatureProperties(elements) {
        return elements.reduce(function (results, signature) {
            // join multi-line strings
            var value = '';
            while (t.isBinaryExpression(signature)) {
                // value = ((signature.left.value || signature.left.right.value) + signature.right.value;
                value = signature.right.value + value;
                signature = signature.left;
            }
            value = signature.value + value;
            var match = value.match(/([^\(]+)\(([^\)]+)/), functionName = match[1], observedProperties = match[2];
            results[functionName] = createDecorator('observe', observedProperties);
            return results;
        }, {});
    }
    function parsePolymerEventListenerProperties(properties) {
        return properties.reduce(function (results, property) {
            var eventName = property.key.value || property.key.name, functionName = property.value.value, functionEvents = results[functionName];
            if (!functionEvents) {
                functionEvents = results[functionName] = [];
            }
            functionEvents.push(createDecorator('listen', eventName));
            return results;
        }, {});
    }
    function parsePolymerBehaviorReference(useBehaviorDecorator, node) {
        return useBehaviorDecorator ? createDecorator('behavior', node) : node;
    }
    function guessTypeFromName(name) {
        var type;
        if (name.match(/^(opt_)?is[A-Z]/)) {
            type = 'boolean';
        }
        else {
            switch (name) {
                case 'el':
                    type = 'HTMLElement';
                    break;
                case 'event':
                    type = 'Event';
                    break;
                case 'keyboardEvent':
                    type = 'KeyboardEvent';
                    break;
                default:
                    if (name.match(/Element$/)) {
                        type = 'HTMLElement';
                    }
                    else if (name.match(/(String|Name)$/)) {
                        type = 'string';
                    }
                    else if (name.match(/EventTarget$/)) {
                        type = 'EventTarget';
                    }
            }
        }
        return type;
    }
    function parseNonPolymerFunction(node) {
        var name = node.key.name, params = node.value.params, body /*: Array<Statement */ = node.value.body.body;
        var method = t.classMethod('method', t.identifier(name), params, t.blockStatement(body));
        // Attempt to guess the types from parameter names
        if (params) {
            params.forEach(function (param) {
                param.optional = !!param.name.match(/^opt/);
                var type = guessTypeFromName(param.name);
                if (type) {
                    param.typeAnnotation = createTypeAnnotation(type);
                }
            });
        }
        // Some functions have JSDoc annotations
        // https://developers.google.com/closure/compiler/docs/js-for-compiler#types
        if (node.leadingComments) {
            var typedParams = node.leadingComments[0].value.match(/@param {[^}]+} \S+/g);
            if (typedParams) {
                for (var i = 0; i < typedParams.length; i++) {
                    var typedParam = typedParams[i], match = typedParam.match(/{!?([^=}]+)(=?)} (\S+)/), type = match[1], param = match[3];
                    if (!!match[2]) {
                        params[i].optional = true;
                    }
                    // remove 'undefined'
                    match = type.match(/(.*[^|])?\|?undefined\|?(.*)/);
                    if (match) {
                        if (match[1]) {
                            type = match[2] ? (match[1] + '|' + match[2]) : match[1];
                        }
                        else {
                            type = match[2];
                        }
                    }
                    if (params[i] && params[i].name == param) {
                        params[i].typeAnnotation = createTypeAnnotation(type);
                    }
                    else {
                        console.warn('param', i, '(' + params[i] + ') !=', param);
                    }
                }
            }
            method.leadingComments = node.leadingComments;
        }
        return method;
    }
    function parsePolymerProperty(property) {
        var name = property.key.name, attributes = property.value.properties, type, value, isFunction, params, readonly = false, decoratorProps = [];
        if (t.isIdentifier(property.value)) {
            type = createTypeAnnotation(property.value.name, name);
        }
        else {
            attributes.forEach(function (attribute) {
                var attr_name = attribute.key.name;
                switch (attr_name) {
                    case 'type':
                        // one of Boolean, Date, Number, String, Array or Object
                        type = createTypeAnnotation(attribute.value.name, name);
                        decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.name));
                        break;
                    case 'value':
                        // Default value for the property
                        value = attribute.value;
                        //decoratorProps.push(createDecoratorProperty(attr_name, attribute.value));
                        if (t.isFunctionExpression(value)) {
                            isFunction = true;
                            params = [];
                        }
                        if (type === undefined && !t.isNullLiteral(value)) {
                            if (t.isCallExpression(value)) {
                                // TODO: determine actual type
                                type = t.typeAnnotation(t.genericTypeAnnotation(t.identifier('object')));
                            }
                            else if (t.isFunctionExpression(value)) {
                                type = t.typeAnnotation(t.functionTypeAnnotation());
                            }
                            else {
                                type = t.createTypeAnnotationBasedOnTypeof(value);
                            }
                        }
                        break;
                    case 'readOnly':
                        readonly = true;
                    // fall-through
                    case 'reflectToAttribute':
                    case 'notify':
                        decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.value));
                        break;
                    case 'computed':
                    case 'observer':
                        // computed function call (as string)        ;
                        decoratorProps.push(createDecoratorProperty(attr_name, '\'' + attribute.value.value + '\''));
                        break;
                    default:
                        console.warn('Unexpected property attribute: ', attribute.key.name, 'at line', attribute.loc.start.line);
                        decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.value));
                }
            });
        }
        var decorators = [t.decorator(t.callExpression(t.identifier('property'), [t.objectExpression(decoratorProps)]))];
        if (property.leadingComments) {
            var match = property.leadingComments[0].value.match(/@type {(?!hydrolysis)([^}]+)}/);
            if (match) {
                type = createTypeAnnotation(match[1], name);
            }
        }
        if (isFunction) {
            postConstuctSetters[name] = value.body.body;
            var result = t.classProperty(t.identifier(name), undefined, type, decorators);
        }
        else {
            var result = t.classProperty(t.identifier(name), value, type, decorators);
        }
        result.leadingComments = property.leadingComments;
        return result;
    }
    var polymerPathsByFileName = {
        'iron-button-state': 'iron-behaviors',
        'iron-control-state': 'iron-behaviors',
        'iron-menu-behavior': 'iron-menu-behavior',
        'iron-menubar-behavior': 'iron-menu-behavior',
        'iron-multi-selectable-behavior': 'iron-selector',
        'iron-selectable': 'iron-selector',
        'iron-selection': 'iron-selector',
        'paper-button-behavior': 'paper-behaviors',
        'paper-checked-element-behavior': 'paper-behaviors',
        'paper-inky-focus-behavior': 'paper-behaviors',
        'paper-ripple-behavior': 'paper-behaviors'
    };
    function getPathForPolymerFileName(filePath, dtsFileName) {
        dtsFileName = dtsFileName.replace(/-impl$/, '');
        var path = polymerPathsByFileName[dtsFileName];
        if (!path) {
            if (verifyPathExists(filePath + dtsFileName + '/' + dtsFileName + '.html')) {
                return dtsFileName;
            }
            path = dtsFileName.match(/[^-]+-[^-]+/)[0];
            if (verifyPathExists(filePath + path + '/' + dtsFileName + '.html')) {
                return path;
            }
            console.info('!!!!!!!!!!!!!!!!!!!!!!!!! failed to find path for', dtsFileName);
        }
        return path;
    }
    function verifyPathExists(filePath) {
        try {
            if (fs.accessSync) {
                fs.accessSync(filePath, fs.F_OK);
            }
            else {
                fs.lstatSync(filePath);
            }
            return true;
        }
        catch (e) {
            return false;
        }
    }
    function addTypeDefinitionReference(path, state, dtsFileName) {
        // Find the file's relative path to bower_components
        var filePath = state.file.opts.filename, dots = '';
        while (filePath) {
            filePath = filePath.match(/(.*)\/.*/);
            filePath = filePath && filePath[1];
            if (filePath) {
                if (verifyPathExists(filePath + '/bower_components')) {
                    break;
                }
                else {
                    dots += '../';
                }
            }
        }
        // Write out the TypeScript code
        if (dtsFileName) {
            var dtsPath = getPathForPolymerFileName(filePath + '/bower_components/', dtsFileName);
            state.file.path.addComment('leading', '/ <reference path="' + dots + 'typings/' + dtsPath + '/' + dtsFileName + '.d.ts"/>', true);
        }
        else {
            state.file.path.addComment('leading', '/ <reference path="' + dots + 'bower_components/polymer-ts/polymer-ts.d.ts"/>', true);
        }
    }
    /*
    TODO:
    - need to export behavior classes
    - /// <reference path="../../bower_components/.....
    */
    /**
      THe implementation of this probably isn't spot on, for now I just want to extract enough to generate .d.ts files
      for the Polymer Material components.
      */
    function parsePolymerBehaviorDefinition(arrayExpression, path, state, memberExpression) {
        var classDeclaration = t.classDeclaration(t.identifier(memberExpression.property.name), null, t.classBody([]), []);
        classDeclaration.implements = arrayExpression.elements.map(function (behavior) {
            if (behavior.property.name != memberExpression.property.name + 'Impl') {
                addTypeDefinitionReference(path, state, toDashCase(behavior.property.name));
            }
            return t.classImplements(behavior.property);
        });
        //classDeclaration.modifiers = [t.absract]
        path.parentPath.replaceWith(t.declareModule(t.identifier(memberExpression.object.name), t.blockStatement([classDeclaration])));
    }
    function parsePolymerClass(objectExpression, path, state, memberExpression) {
        var className, elementName, extend, behaviors, hostAttributes, properties /*: Array<ClassProperty> */ = [], constructor, functions /*: Array<ClassMethod>*/ = [];
        objectExpression.properties.forEach(function (config) {
            switch (config.key.name) {
                case 'is':
                    elementName = config.value.value;
                    className = toUpperCamel(config.value.value);
                    console.info('Parsing Polymer element', elementName, 'in', state.file.opts.filename);
                    break;
                case 'extends':
                    extend = config.value.value;
                    break;
                case 'behaviors':
                    behaviors = config.value.elements.map(parsePolymerBehaviorReference.bind(undefined, state.opts.useBehaviorDecorator));
                    break;
                case 'properties':
                    properties = config.value.properties.map(parsePolymerProperty);
                    break;
                case 'hostAttributes':
                    hostAttributes = config.value;
                    break;
                case 'observers':
                    observers = parsePolymerFunctionSignatureProperties(config.value.elements);
                    break;
                case 'listeners':
                    listeners = parsePolymerEventListenerProperties(config.value.properties);
                    break;
                default:
                    if (t.isObjectMethod(config)) {
                        functions.push(t.classMethod(config.kind, config.key, config.params, config.body, config.computed, config.static));
                    }
                    else if (t.isFunctionExpression(config.value)) {
                        var method = parseNonPolymerFunction(config);
                        if (method.key.name == 'factoryImpl') {
                            method.key.name = method.kind = 'constructor';
                            constructor = method;
                        }
                        else {
                            // Add observer decorators
                            var functionObserver = observers[method.key.name];
                            if (functionObserver) {
                                if (!method.decorators) {
                                    method.decorators = [];
                                }
                                method.decorators.push(functionObserver);
                            }
                            // Add listener decorators
                            var functionListeners = listeners[method.key.name];
                            if (functionListeners) {
                                functionListeners.forEach(function (listener) {
                                    if (!method.decorators) {
                                        method.decorators = [];
                                    }
                                    method.decorators.push(listener);
                                });
                            }
                            functions.push(method);
                        }
                    }
                    else if (t.isObjectExpression) {
                        properties.push(t.classProperty(t.identifier(config.key.name), config.value));
                    }
                    else {
                        console.warn("!!!!!!!!!!! Unexpected property:", config.key + ':', config.value);
                    }
            }
        });
        var decorators = [];
        if (elementName) {
            decorators.push(createDecorator('component', elementName));
            if (extend) {
                decorators.push(createDecorator('extend', extend));
            }
        }
        if (hostAttributes) {
            decorators.push(createDecorator('hostAttributes', hostAttributes));
        }
        if (behaviors && state.opts.useBehaviorDecorator) {
            decorators = decorators.concat(behaviors);
        }
        // Add any postConstructorSetters (Polymer properties with a function for `value`)
        var constuctorBody /*: Array<Statement>*/ = constructor ? constructor.body.body : [];
        for (var key in postConstuctSetters) {
            var postConstuctSetter /*: BlockStatement | Expression */ = postConstuctSetters[key];
            constuctorBody.push(t.expressionStatement(t.AssignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(key)), t.callExpression(t.arrowFunctionExpression([], t.blockStatement(postConstuctSetter)), []))));
        }
        if (constuctorBody.length) {
            properties.push(constructor || t.classMethod('constructor', t.identifier('constructor'), [], t.blockStatement(constuctorBody)));
        }
        addTypeDefinitionReference(path, state);
        if (memberExpression) {
            className = memberExpression.property.name;
        }
        var classDeclaration = t.classDeclaration(t.identifier(className), t.memberExpression(t.identifier('polymer'), t.identifier('Base')), t.classBody(properties.concat(functions)), decorators);
        if (behaviors && !state.opts.useBehaviorDecorator) {
            classDeclaration.implements = behaviors.map(function (behavior) {
                return t.classImplements(behavior);
            });
        }
        if (memberExpression) {
            //TODO: export class, module on same line as Polymer
            //      let module = t.declareModule(t.identifier(memberExpression.object.name),
            //                                                  t.blockStatement([classDeclaration]));
            var module_1 = t.blockStatement([classDeclaration]);
            path.parentPath.replaceWithMultiple([t.identifier('module'), t.identifier('Polymer'), module_1]);
        }
        else {
            path.parentPath.replaceWith(classDeclaration);
            path.parentPath.insertAfter(t.expressionStatement(t.callExpression(t.memberExpression(t.identifier(className), t.identifier('register')), [])));
        }
    }
    function evaluateFunctionExpression(functionExpression) {
        var namedStatements = {}, result;
        functionExpression.body.body.forEach(function (statement) {
            if (t.isReturnStatement(statement)) {
                result = statement.argument;
            }
            else if (t.isFunctionDeclaration(statement)) {
                namedStatements[statement.id.name] = t.functionExpression(null, statement.params, statement.body);
            }
        });
        result.properties.forEach(function (property) {
            if (t.isIdentifier(property.value)) {
                var statement = namedStatements[property.value.name];
                if (statement !== undefined) {
                    property.value = statement;
                }
            }
        });
        return result;
    }
    return {
        visitor: {
            CallExpression: function (path, state) {
                observers = {};
                listeners = {};
                postConstuctSetters = {};
                // For some reason we visit each identifier twice
                if (path.node.callee.start != start) {
                    start = path.node.callee.start;
                    if (!path.node.callee.name && t.isFunctionExpression(path.node.callee)) {
                        // anonymous function - won't be able to generate .d.ts
                        var bodyNodes = path.node.callee.body.body;
                        path.replaceWith(bodyNodes[0]);
                        for (var i = 1; i < bodyNodes.length; i++) {
                            path.parentPath.insertAfter(bodyNodes[i]);
                        }
                    }
                    else if (path.node.callee.name == 'Polymer') {
                        var memberExpression = t.isAssignmentExpression(path.parent) &&
                            t.isMemberExpression(path.parent.left) ?
                            path.parent.left : undefined;
                        //module = path.parent.left.object.name;
                        // path.parent.left.property.name
                        parsePolymerClass(path.node.arguments[0], path, state, memberExpression);
                    }
                }
            },
            AssignmentExpression: function (path, state) {
                if (t.isMemberExpression(path.node.left)) {
                    if (path.node.left.object.name == 'Polymer') {
                        var className = path.node.left.object.name + '.' + path.node.left.property.name;
                        console.info('Parsing Polymer behavior', className, 'in', state.file.opts.filename);
                        if (t.isCallExpression(path.node.right)) {
                            console.info('.......... Call within assignment', state.file.opts.filename);
                        }
                        else if (t.isObjectExpression(path.node.right)) {
                            parsePolymerClass(path.node.right, path, state, path.node.left);
                        }
                        else if (t.isArrayExpression(path.node.right)) {
                            parsePolymerBehaviorDefinition(path.node.right, path, state, path.node.left);
                        }
                    }
                }
            }
        }
    };
}
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
function logPath(path) {
    for (var propName in path) {
        if (path.hasOwnProperty(propName)
            && propName != 'parentPath' && propName != 'parent'
            && propName != 'hub'
            && propName != 'container') {
            console.log(propName, path[propName]);
        }
    }
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbInRvRGFzaENhc2UiLCJ0b1VwcGVyQ2FtZWwiLCJjcmVhdGVEZWNvcmF0b3IiLCJjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eSIsImNyZWF0ZVR5cGVBbm5vdGF0aW9uIiwicGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzIiwicGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMiLCJwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSIsImd1ZXNzVHlwZUZyb21OYW1lIiwicGFyc2VOb25Qb2x5bWVyRnVuY3Rpb24iLCJwYXJzZVBvbHltZXJQcm9wZXJ0eSIsImdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUiLCJ2ZXJpZnlQYXRoRXhpc3RzIiwiYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UiLCJwYXJzZVBvbHltZXJCZWhhdmlvckRlZmluaXRpb24iLCJwYXJzZVBvbHltZXJDbGFzcyIsImV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uIiwiQ2FsbEV4cHJlc3Npb24iLCJBc3NpZ25tZW50RXhwcmVzc2lvbiIsImxvZ1BhdGgiXSwibWFwcGluZ3MiOiJBQUFBLGtDQUFrQztBQUVsQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUV4QyxJQUFPLEVBQUUsV0FBVyxJQUFJLENBQUMsQ0FBQztBQUUxQixtQkFBd0IsRUFBWTtRQUFILENBQUM7SUFDakMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQ1QsU0FBUyxHQUFHLEVBQUUsRUFDZCxTQUFTLEdBQUcsRUFBRSxFQUNkLG1CQUFtQixHQUFHLEVBQUUsQ0FBQztJQUU3QixvQkFBb0IsR0FBVztRQUM3QkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxVQUFTQSxFQUFFQSxFQUFFQSxFQUFFQSxFQUFFQSxFQUFFQSxJQUFFLE1BQU0sQ0FBQyxFQUFFLEdBQUcs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QUNqREEsRUFBRUEsQ0FBQUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ25DQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFFL0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3ZFQSx1REFBdURBO3dCQUN2REEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7d0JBQzNDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBOzRCQUMxQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzVDQSxDQUFDQTtvQkFDSEEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM5Q0EsSUFBSUEsZ0JBQWdCQSxHQUFHQSxDQUFDQSxDQUFDQSxzQkFBc0JBLENBQUNBLElBQUlBLENBQUNBLE1B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Y0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7ZUFDM0JBLFFBQVFBLElBQUlBLFlBQVlBLElBQUlBLFFBQVFBLElBQUlBLFFBQVFBO2VBQ2hEQSxRQUFRQSxJQUFJQSxLQUFLQTtlQUNqQkEsUUFBUUEsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hDQSxDQUFDQTtJQUNIQSxDQUFDQTtBQUNIQSxDQUFDQSIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJub2RlLmQudHNcIiAvPlxuZGVjbGFyZSBmdW5jdGlvbiByZXF1aXJlKG5hbWU6IHN0cmluZyk7XG5yZXF1aXJlKCdzb3VyY2UtbWFwLXN1cHBvcnQnKS5pbnN0YWxsKCk7XG5cbmltcG9ydCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHsgdHlwZXM6IHQgfSkge1xuXHR2YXIgc3RhcnQgPSAtMSxcbiAgICAgIG9ic2VydmVycyA9IHt9LFxuICAgICAgbGlzdGVuZXJzID0ge30sXG4gICAgICBwb3N0Q29uc3R1Y3RTZXR0ZXJzID0ge307XG5cbiAgZnVuY3Rpb24gdG9EYXNoQ2FzZShzdHI6IHN0cmluZyl7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oW2Etel0rKShbQS1aXSkvZywgZnVuY3Rpb24oJDAsICQxLCAkMil7cmV0dXJuICQxICsgJy0nICsgJDI7fSkudG9Mb3dlckNhc2UoKTtcbiAgfSAgICBcblxuICBmdW5jdGlvbiB0b1VwcGVyQ2FtZWwoc3RyOiBzdHJpbmcpe1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvXlthLXpdfChcXC1bYS16XSkvZywgZnVuY3Rpb24oJDEpe3JldHVybiAkMS50b1VwcGVyQ2FzZSgpLnJlcGxhY2UoJy0nLCcnKTt9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZURlY29yYXRvcihuYW1lOiBzdHJpbmcsIHZhbHVlKSB7XG4gICAgICByZXR1cm4gdC5kZWNvcmF0b3IodC5jYWxsRXhwcmVzc2lvbih0LmlkZW50aWZpZXIobmFtZSksXG4gICAgICAgICAgICAgIFt0eXBlb2YgdmFsdWUgPT0gJ3N0cmluZycgPyB0LnN0cmluZ0xpdGVyYWwodmFsdWUpIDogdmFsdWVdKSk7XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZykge1xuLy9jb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tLS0tLS0tIGNyZWF0ZURlY29yYXRvclByb3BlcnR5OicsIHZhbHVlKSAgICA7XG4vL2NvbnNvbGUuaW5mbygndHR0dHR0dHR0dHR0dHR0dHQgdHlwZTonLCB0eXBlb2YgdmFsdWUpO1xuICAgIHN3aXRjaCh0eXBlb2YgdmFsdWUpIHtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuIHQub2JqZWN0UHJvcGVydHkoXG4gICAgICAgIHQuaWRlbnRpZmllcihrZXkpLFxuICAgICAgICB2YWx1ZVxuICAgICAgKTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICB9XG4gICAgcmV0dXJuIHQub2JqZWN0UHJvcGVydHkoXG4gICAgICB0LmlkZW50aWZpZXIoa2V5KSxcbiAgICAgIHQuaWRlbnRpZmllcih2YWx1ZSlcbiAgICApO1xuICB9XG5cbiAgLyoqIEBwYXJhbSB0eXBlIC0gb25lIG9mIEJvb2xlYW4sIERhdGUsIE51bWJlciwgU3RyaW5nLCBBcnJheSBvciBPYmplY3QgKi9cbiAgZnVuY3Rpb24gY3JlYXRlVHlwZUFubm90YXRpb24odHlwZTogc3RyaW5nLCBuYW1lPzogc3RyaW5nLCBlbGVtZW50VHlwZSA9ICdhbnknKSB7XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICBjb25zb2xlLmluZm8oJyEhISEhISEhISEhISEhISEhISBubyB0eXBlIGZvcicsIG5hbWUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBzd2l0Y2godHlwZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuc3RyaW5nVHlwZUFubm90YXRpb24oKSk7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAvLyByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmJvb2xlYW5UeXBlQW5ub3RhdGlvbigpKTtcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuZ2VuZXJpY1R5cGVBbm5vdGF0aW9uKHQuaWRlbnRpZmllcignYm9vbGVhbicpKSk7XG4gICAgY2FzZSAnZGF0ZSc6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmRhdGVUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5udW1iZXJUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmFycmF5VHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKGVsZW1lbnRUeXBlKSkpO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIGlmIChuYW1lKSB7XG4gICAgICAgIGxldCBndWVzc2VkVHlwZSA9IGd1ZXNzVHlwZUZyb21OYW1lKG5hbWUpO1xuICAgICAgICBpZiAoZ3Vlc3NlZFR5cGUpIHtcbiAgICAgICAgICByZXR1cm4gY3JlYXRlVHlwZUFubm90YXRpb24oZ3Vlc3NlZFR5cGUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmdlbmVyaWNUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIodHlwZSkpKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJGdW5jdGlvblNpZ25hdHVyZVByb3BlcnRpZXMoZWxlbWVudHMpIHtcbiAgICByZXR1cm4gZWxlbWVudHMucmVkdWNlKCAocmVzdWx0cywgc2lnbmF0dXJlKSA9PiB7XG4gICAgICAvLyBqb2luIG11bHRpLWxpbmUgc3RyaW5nc1xuICAgICAgbGV0IHZhbHVlID0gJyc7XG4gICAgICB3aGlsZSh0LmlzQmluYXJ5RXhwcmVzc2lvbihzaWduYXR1cmUpKSB7XG4gICAgICAgIC8vIHZhbHVlID0gKChzaWduYXR1cmUubGVmdC52YWx1ZSB8fCBzaWduYXR1cmUubGVmdC5yaWdodC52YWx1ZSkgKyBzaWduYXR1cmUucmlnaHQudmFsdWU7XG4gICAgICAgIHZhbHVlID0gc2lnbmF0dXJlLnJpZ2h0LnZhbHVlICsgdmFsdWU7XG4gICAgICAgIHNpZ25hdHVyZSA9IHNpZ25hdHVyZS5sZWZ0O1xuICAgICAgfVxuICAgICAgdmFsdWUgPSBzaWduYXR1cmUudmFsdWUgKyB2YWx1ZTtcblxuICAgICAgbGV0IG1hdGNoID0gdmFsdWUubWF0Y2goLyhbXlxcKF0rKVxcKChbXlxcKV0rKS8pLFxuICAgICAgICBmdW5jdGlvbk5hbWUgPSBtYXRjaFsxXSxcbiAgICAgICAgb2JzZXJ2ZWRQcm9wZXJ0aWVzID0gbWF0Y2hbMl07XG4gICAgICByZXN1bHRzW2Z1bmN0aW9uTmFtZV0gPSBjcmVhdGVEZWNvcmF0b3IoJ29ic2VydmUnLCBvYnNlcnZlZFByb3BlcnRpZXMpO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSwge30pO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMocHJvcGVydGllcykge1xuICAgIHJldHVybiBwcm9wZXJ0aWVzLnJlZHVjZSggKHJlc3VsdHMsIHByb3BlcnR5KSA9PiB7XG4gICAgICBsZXQgZXZlbnROYW1lID0gcHJvcGVydHkua2V5LnZhbHVlIHx8IHByb3BlcnR5LmtleS5uYW1lLFxuICAgICAgICAgIGZ1bmN0aW9uTmFtZSA9IHByb3BlcnR5LnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGZ1bmN0aW9uRXZlbnRzID0gcmVzdWx0c1tmdW5jdGlvbk5hbWVdO1xuICAgICAgaWYoIWZ1bmN0aW9uRXZlbnRzKSB7XG4gICAgICAgIGZ1bmN0aW9uRXZlbnRzID0gcmVzdWx0c1tmdW5jdGlvbk5hbWVdID0gW107XG4gICAgICB9XG4gICAgICBmdW5jdGlvbkV2ZW50cy5wdXNoKGNyZWF0ZURlY29yYXRvcignbGlzdGVuJywgZXZlbnROYW1lKSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9LCB7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSh1c2VCZWhhdmlvckRlY29yYXRvciwgbm9kZSkge1xuICAgIHJldHVybiB1c2VCZWhhdmlvckRlY29yYXRvciA/IGNyZWF0ZURlY29yYXRvcignYmVoYXZpb3InLCBub2RlKSA6IG5vZGU7XG4gIH1cblxuICBmdW5jdGlvbiBndWVzc1R5cGVGcm9tTmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICB2YXIgdHlwZTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXihvcHRfKT9pc1tBLVpdLykpIHtcbiAgICAgIHR5cGUgPSAnYm9vbGVhbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN3aXRjaCAobmFtZSkge1xuICAgICAgICBjYXNlICdlbCc6XG4gICAgICAgICAgdHlwZSA9ICdIVE1MRWxlbWVudCc7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V2ZW50JzpcbiAgICAgICAgICB0eXBlID0gJ0V2ZW50JztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAna2V5Ym9hcmRFdmVudCc6XG4gICAgICAgICAgdHlwZSA9ICdLZXlib2FyZEV2ZW50JztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBpZiAobmFtZS5tYXRjaCgvRWxlbWVudCQvKSkge1xuICAgICAgICAgICAgdHlwZSA9ICdIVE1MRWxlbWVudCc7XG4gICAgICAgICAgfSBlbHNlIGlmIChuYW1lLm1hdGNoKC8oU3RyaW5nfE5hbWUpJC8pKSB7XG4gICAgICAgICAgICB0eXBlID0gJ3N0cmluZyc7XG4gICAgICAgICAgfSBlbHNlIGlmIChuYW1lLm1hdGNoKC9FdmVudFRhcmdldCQvKSkge1xuICAgICAgICAgICAgdHlwZSA9ICdFdmVudFRhcmdldCc7XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTm9uUG9seW1lckZ1bmN0aW9uKG5vZGUpIHtcbiAgICBsZXQgbmFtZSA9IG5vZGUua2V5Lm5hbWUsXG4gICAgICBwYXJhbXMgPSBub2RlLnZhbHVlLnBhcmFtcyxcbiAgICAgIGJvZHkgLyo6IEFycmF5PFN0YXRlbWVudCAqLyA9IG5vZGUudmFsdWUuYm9keS5ib2R5O1xuXG4gICAgbGV0IG1ldGhvZCA9IHQuY2xhc3NNZXRob2QoJ21ldGhvZCcsIHQuaWRlbnRpZmllcihuYW1lKSwgcGFyYW1zLCB0LmJsb2NrU3RhdGVtZW50KGJvZHkpKTtcblxuICAgIC8vIEF0dGVtcHQgdG8gZ3Vlc3MgdGhlIHR5cGVzIGZyb20gcGFyYW1ldGVyIG5hbWVzXG4gICAgaWYgKHBhcmFtcykge1xuICAgICAgcGFyYW1zLmZvckVhY2goIChwYXJhbSkgPT4ge1xuICAgICAgICBwYXJhbS5vcHRpb25hbCA9ICEhcGFyYW0ubmFtZS5tYXRjaCgvXm9wdC8pO1xuXG4gICAgICAgIGxldCB0eXBlID0gZ3Vlc3NUeXBlRnJvbU5hbWUocGFyYW0ubmFtZSk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcGFyYW0udHlwZUFubm90YXRpb24gPSBjcmVhdGVUeXBlQW5ub3RhdGlvbih0eXBlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU29tZSBmdW5jdGlvbnMgaGF2ZSBKU0RvYyBhbm5vdGF0aW9uc1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2Nsb3N1cmUvY29tcGlsZXIvZG9jcy9qcy1mb3ItY29tcGlsZXIjdHlwZXNcbiAgICBpZiAobm9kZS5sZWFkaW5nQ29tbWVudHMpIHtcbiAgICAgIGxldCB0eXBlZFBhcmFtcyA9IG5vZGUubGVhZGluZ0NvbW1lbnRzWzBdLnZhbHVlLm1hdGNoKC9AcGFyYW0ge1tefV0rfSBcXFMrL2cpO1xuICAgICAgaWYgKHR5cGVkUGFyYW1zKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHlwZWRQYXJhbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBsZXQgdHlwZWRQYXJhbSA9IHR5cGVkUGFyYW1zW2ldLFxuICAgICAgICAgICAgICBtYXRjaCA9IHR5cGVkUGFyYW0ubWF0Y2goL3shPyhbXj19XSspKD0/KX0gKFxcUyspLyksXG4gICAgICAgICAgICAgIHR5cGUgPSBtYXRjaFsxXSxcbiAgICAgICAgICAgICAgcGFyYW0gPSBtYXRjaFszXTtcblxuICAgICAgICAgIGlmICghIW1hdGNoWzJdKSB7XG4gICAgICAgICAgICBwYXJhbXNbaV0ub3B0aW9uYWwgPSB0cnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIHJlbW92ZSAndW5kZWZpbmVkJ1xuICAgICAgICAgIG1hdGNoID0gdHlwZS5tYXRjaCgvKC4qW158XSk/XFx8P3VuZGVmaW5lZFxcfD8oLiopLyk7XG4gICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBpZiAobWF0Y2hbMV0pIHtcbiAgICAgICAgICAgICAgdHlwZSA9IG1hdGNoWzJdID8gKG1hdGNoWzFdICsgJ3wnICsgbWF0Y2hbMl0pIDogbWF0Y2hbMV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0eXBlID0gbWF0Y2hbMl07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHBhcmFtc1tpXSAmJiBwYXJhbXNbaV0ubmFtZSA9PSBwYXJhbSkge1xuICAgICAgICAgICAgcGFyYW1zW2ldLnR5cGVBbm5vdGF0aW9uID0gY3JlYXRlVHlwZUFubm90YXRpb24odHlwZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybigncGFyYW0nLCBpLCAnKCcgKyBwYXJhbXNbaV0gKyAnKSAhPScsIHBhcmFtKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbWV0aG9kLmxlYWRpbmdDb21tZW50cyA9IG5vZGUubGVhZGluZ0NvbW1lbnRzO1xuICAgIH1cblxuICAgIHJldHVybiBtZXRob2Q7XG4gIH1cblxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lclByb3BlcnR5KHByb3BlcnR5KSAvKjogQ2xhc3NQcm9wZXJ0eSAqLyB7XG4gICAgbGV0IG5hbWU6IHN0cmluZyA9IHByb3BlcnR5LmtleS5uYW1lLFxuICAgICAgICBhdHRyaWJ1dGVzID0gcHJvcGVydHkudmFsdWUucHJvcGVydGllcyxcbiAgICAgICAgdHlwZSwgdmFsdWUsIGlzRnVuY3Rpb24sIHBhcmFtcywgcmVhZG9ubHkgPSBmYWxzZSwgZGVjb3JhdG9yUHJvcHMgPSBbXTtcblxuICAgIGlmKHQuaXNJZGVudGlmaWVyKHByb3BlcnR5LnZhbHVlKSkge1xuICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKHByb3BlcnR5LnZhbHVlLm5hbWUsIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhdHRyaWJ1dGVzLmZvckVhY2goIChhdHRyaWJ1dGUpID0+IHtcbiAgICAgICAgbGV0IGF0dHJfbmFtZTogc3RyaW5nID0gYXR0cmlidXRlLmtleS5uYW1lO1xuICAgICAgICBzd2l0Y2goYXR0cl9uYW1lKSB7XG4gICAgICAgIGNhc2UgJ3R5cGUnOlxuICAgICAgICAgIC8vIG9uZSBvZiBCb29sZWFuLCBEYXRlLCBOdW1iZXIsIFN0cmluZywgQXJyYXkgb3IgT2JqZWN0XG4gICAgICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKGF0dHJpYnV0ZS52YWx1ZS5uYW1lLCBuYW1lKTtcbiAgICAgICAgICBkZWNvcmF0b3JQcm9wcy5wdXNoKGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGF0dHJfbmFtZSwgYXR0cmlidXRlLnZhbHVlLm5hbWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndmFsdWUnOlxuICAgICAgICAgIC8vIERlZmF1bHQgdmFsdWUgZm9yIHRoZSBwcm9wZXJ0eVxuICAgICAgICAgIHZhbHVlID0gYXR0cmlidXRlLnZhbHVlO1xuICAgICAgICAgIC8vZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZSkpO1xuICAgICAgICAgIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICBpc0Z1bmN0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHBhcmFtcyA9IFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZih0eXBlID09PSB1bmRlZmluZWQgJiYgIXQuaXNOdWxsTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIGlmICh0LmlzQ2FsbEV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIC8vIFRPRE86IGRldGVybWluZSBhY3R1YWwgdHlwZVxuICAgICAgICAgICAgICB0eXBlID0gdC50eXBlQW5ub3RhdGlvbih0LmdlbmVyaWNUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoJ29iamVjdCcpKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSB0LnR5cGVBbm5vdGF0aW9uKHQuZnVuY3Rpb25UeXBlQW5ub3RhdGlvbigpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHR5cGUgPSB0LmNyZWF0ZVR5cGVBbm5vdGF0aW9uQmFzZWRPblR5cGVvZih2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWFkT25seSc6XG4gICAgICAgICAgcmVhZG9ubHkgPSB0cnVlO1xuICAgICAgICAgIC8vIGZhbGwtdGhyb3VnaFxuICAgICAgICBjYXNlICdyZWZsZWN0VG9BdHRyaWJ1dGUnOlxuICAgICAgICBjYXNlICdub3RpZnknOlxuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCBhdHRyaWJ1dGUudmFsdWUudmFsdWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29tcHV0ZWQnOlxuICAgICAgICBjYXNlICdvYnNlcnZlcic6XG4gICAgICAgICAgLy8gY29tcHV0ZWQgZnVuY3Rpb24gY2FsbCAoYXMgc3RyaW5nKSAgICAgICAgO1xuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCAnXFwnJyArIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSArICdcXCcnKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgY29uc29sZS53YXJuKCdVbmV4cGVjdGVkIHByb3BlcnR5IGF0dHJpYnV0ZTogJywgYXR0cmlidXRlLmtleS5uYW1lLCAnYXQgbGluZScsIGF0dHJpYnV0ZS5sb2Muc3RhcnQubGluZSk7XG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBsZXQgZGVjb3JhdG9ycyA9IFt0LmRlY29yYXRvcihcbiAgICAgICAgICB0LmNhbGxFeHByZXNzaW9uKFxuICAgICAgICAgICAgdC5pZGVudGlmaWVyKCdwcm9wZXJ0eScpLFxuICAgICAgICAgICAgW3Qub2JqZWN0RXhwcmVzc2lvbihkZWNvcmF0b3JQcm9wcyldXG4gICAgICAgICAgKVxuICAgICAgICApXTtcblxuICAgIGlmIChwcm9wZXJ0eS5sZWFkaW5nQ29tbWVudHMpIHtcbiAgICAgIGxldCBtYXRjaCA9IHByb3BlcnR5LmxlYWRpbmdDb21tZW50c1swXS52YWx1ZS5tYXRjaCgvQHR5cGUgeyg/IWh5ZHJvbHlzaXMpKFtefV0rKX0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICB0eXBlID0gY3JlYXRlVHlwZUFubm90YXRpb24obWF0Y2hbMV0sIG5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmKGlzRnVuY3Rpb24pIHtcbiAgICAgIHBvc3RDb25zdHVjdFNldHRlcnNbbmFtZV0gPSB2YWx1ZS5ib2R5LmJvZHk7XG4gICAgICB2YXIgcmVzdWx0ID0gdC5jbGFzc1Byb3BlcnR5KHQuaWRlbnRpZmllcihuYW1lKSwgdW5kZWZpbmVkLCB0eXBlLCBkZWNvcmF0b3JzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc3VsdCA9IHQuY2xhc3NQcm9wZXJ0eSh0LmlkZW50aWZpZXIobmFtZSksIHZhbHVlLCB0eXBlLCBkZWNvcmF0b3JzKTtcbiAgICB9XG5cbiAgICByZXN1bHQubGVhZGluZ0NvbW1lbnRzID0gcHJvcGVydHkubGVhZGluZ0NvbW1lbnRzO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICB2YXIgcG9seW1lclBhdGhzQnlGaWxlTmFtZSA9IHtcbiAgICAnaXJvbi1idXR0b24tc3RhdGUnOiAnaXJvbi1iZWhhdmlvcnMnLFxuICAgICdpcm9uLWNvbnRyb2wtc3RhdGUnOiAnaXJvbi1iZWhhdmlvcnMnLFxuICAgICdpcm9uLW1lbnUtYmVoYXZpb3InOiAnaXJvbi1tZW51LWJlaGF2aW9yJyxcbiAgICAnaXJvbi1tZW51YmFyLWJlaGF2aW9yJzogJ2lyb24tbWVudS1iZWhhdmlvcicsXG4gICAgJ2lyb24tbXVsdGktc2VsZWN0YWJsZS1iZWhhdmlvcic6ICdpcm9uLXNlbGVjdG9yJyxcbiAgICAnaXJvbi1zZWxlY3RhYmxlJzogJ2lyb24tc2VsZWN0b3InLFxuICAgICdpcm9uLXNlbGVjdGlvbic6ICdpcm9uLXNlbGVjdG9yJyxcbiAgICAncGFwZXItYnV0dG9uLWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ3BhcGVyLWNoZWNrZWQtZWxlbWVudC1iZWhhdmlvcic6ICdwYXBlci1iZWhhdmlvcnMnLFxuICAgICdwYXBlci1pbmt5LWZvY3VzLWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ3BhcGVyLXJpcHBsZS1iZWhhdmlvcic6ICdwYXBlci1iZWhhdmlvcnMnXG4gIH07XG4gIGZ1bmN0aW9uIGdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUoZmlsZVBhdGg6IHN0cmluZywgZHRzRmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgZHRzRmlsZU5hbWUgPSBkdHNGaWxlTmFtZS5yZXBsYWNlKC8taW1wbCQvLCAnJyk7XG4gICAgdmFyIHBhdGggPSBwb2x5bWVyUGF0aHNCeUZpbGVOYW1lW2R0c0ZpbGVOYW1lXTtcblxuICAgIGlmKCFwYXRoKSB7XG4gICAgICBpZih2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoICsgZHRzRmlsZU5hbWUgKyAnLycgKyBkdHNGaWxlTmFtZSArICcuaHRtbCcpKSB7XG4gICAgICAgIHJldHVybiBkdHNGaWxlTmFtZTtcbiAgICAgIH1cbiAgICAgIHBhdGggPSBkdHNGaWxlTmFtZS5tYXRjaCgvW14tXSstW14tXSsvKVswXTtcbiAgICAgIGlmKHZlcmlmeVBhdGhFeGlzdHMoZmlsZVBhdGggKyBwYXRoICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmh0bWwnKSkge1xuICAgICAgICByZXR1cm4gcGF0aDtcbiAgICAgIH1cblxuY29uc29sZS5pbmZvKCchISEhISEhISEhISEhISEhISEhISEhISEhIGZhaWxlZCB0byBmaW5kIHBhdGggZm9yJywgZHRzRmlsZU5hbWUpOyAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBwYXRoO1xuICB9XG5cbiAgZnVuY3Rpb24gdmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICBpZihmcy5hY2Nlc3NTeW5jKSB7XG4gICAgICAgIGZzLmFjY2Vzc1N5bmMoZmlsZVBhdGgsIGZzLkZfT0spO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnMubHN0YXRTeW5jKGZpbGVQYXRoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZGRUeXBlRGVmaW5pdGlvblJlZmVyZW5jZShwYXRoLCBzdGF0ZSwgZHRzRmlsZU5hbWU/OiBzdHJpbmcpIHtcbiAgICAvLyBGaW5kIHRoZSBmaWxlJ3MgcmVsYXRpdmUgcGF0aCB0byBib3dlcl9jb21wb25lbnRzXG4gICAgdmFyIGZpbGVQYXRoID0gc3RhdGUuZmlsZS5vcHRzLmZpbGVuYW1lLCBkb3RzID0gJyc7XG4gICAgd2hpbGUoZmlsZVBhdGgpIHtcbiAgICAgIGZpbGVQYXRoID0gZmlsZVBhdGgubWF0Y2goLyguKilcXC8uKi8pO1xuICAgICAgZmlsZVBhdGggPSBmaWxlUGF0aCAmJiBmaWxlUGF0aFsxXTtcbiAgICAgIGlmKGZpbGVQYXRoKSB7XG4gICAgICAgIGlmKHZlcmlmeVBhdGhFeGlzdHMoZmlsZVBhdGggKyAnL2Jvd2VyX2NvbXBvbmVudHMnKSkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRvdHMgKz0gJy4uLyc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXcml0ZSBvdXQgdGhlIFR5cGVTY3JpcHQgY29kZVxuICAgIGlmKGR0c0ZpbGVOYW1lKSB7XG4gICAgICBsZXQgZHRzUGF0aCA9IGdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUoZmlsZVBhdGggKyAnL2Jvd2VyX2NvbXBvbmVudHMvJywgZHRzRmlsZU5hbWUpO1xuICAgICAgc3RhdGUuZmlsZS5wYXRoLmFkZENvbW1lbnQoJ2xlYWRpbmcnLCAnLyA8cmVmZXJlbmNlIHBhdGg9XCInICsgZG90cyArICd0eXBpbmdzLycgKyBkdHNQYXRoICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmQudHNcIi8+JywgdHJ1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0YXRlLmZpbGUucGF0aC5hZGRDb21tZW50KCdsZWFkaW5nJywgJy8gPHJlZmVyZW5jZSBwYXRoPVwiJyArIGRvdHMgKyAnYm93ZXJfY29tcG9uZW50cy9wb2x5bWVyLXRzL3BvbHltZXItdHMuZC50c1wiLz4nLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuLypcblRPRE86IFxuLSBuZWVkIHRvIGV4cG9ydCBiZWhhdmlvciBjbGFzc2VzXG4tIC8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi9ib3dlcl9jb21wb25lbnRzLy4uLi4uXG4qL1xuICAvKipcbiAgICBUSGUgaW1wbGVtZW50YXRpb24gb2YgdGhpcyBwcm9iYWJseSBpc24ndCBzcG90IG9uLCBmb3Igbm93IEkganVzdCB3YW50IHRvIGV4dHJhY3QgZW5vdWdoIHRvIGdlbmVyYXRlIC5kLnRzIGZpbGVzXG4gICAgZm9yIHRoZSBQb2x5bWVyIE1hdGVyaWFsIGNvbXBvbmVudHMuXG4gICAgKi9cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQmVoYXZpb3JEZWZpbml0aW9uKGFycmF5RXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIG1lbWJlckV4cHJlc3Npb24pIHtcbiAgICBsZXQgY2xhc3NEZWNsYXJhdGlvbiA9IHQuY2xhc3NEZWNsYXJhdGlvbih0LmlkZW50aWZpZXIobWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2xhc3NCb2R5KFtdKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbXSk7XG4gICAgY2xhc3NEZWNsYXJhdGlvbi5pbXBsZW1lbnRzID0gYXJyYXlFeHByZXNzaW9uLmVsZW1lbnRzLm1hcCggKGJlaGF2aW9yKSA9PiB7XG4gICAgICBpZihiZWhhdmlvci5wcm9wZXJ0eS5uYW1lICE9IG1lbWJlckV4cHJlc3Npb24ucHJvcGVydHkubmFtZSArICdJbXBsJykge1xuICAgICAgICBhZGRUeXBlRGVmaW5pdGlvblJlZmVyZW5jZShwYXRoLCBzdGF0ZSwgdG9EYXNoQ2FzZShiZWhhdmlvci5wcm9wZXJ0eS5uYW1lKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdC5jbGFzc0ltcGxlbWVudHMoYmVoYXZpb3IucHJvcGVydHkpO1xuICAgIH0pO1xuICAgIC8vY2xhc3NEZWNsYXJhdGlvbi5tb2RpZmllcnMgPSBbdC5hYnNyYWN0XVxuICAgIFxuICAgIHBhdGgucGFyZW50UGF0aC5yZXBsYWNlV2l0aCh0LmRlY2xhcmVNb2R1bGUodC5pZGVudGlmaWVyKG1lbWJlckV4cHJlc3Npb24ub2JqZWN0Lm5hbWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5ibG9ja1N0YXRlbWVudChbY2xhc3NEZWNsYXJhdGlvbl0pKSk7XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJDbGFzcyhvYmplY3RFeHByZXNzaW9uLCBwYXRoLCBzdGF0ZSwgbWVtYmVyRXhwcmVzc2lvbj8pIHtcbiAgICBsZXQgY2xhc3NOYW1lLCBlbGVtZW50TmFtZSxcbiAgICAgICAgICAgICAgICBleHRlbmQsIGJlaGF2aW9ycywgaG9zdEF0dHJpYnV0ZXMsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllcyAvKjogQXJyYXk8Q2xhc3NQcm9wZXJ0eT4gKi8gPSBbXSxcbiAgICAgICAgICAgICAgICBjb25zdHJ1Y3RvcixcbiAgICAgICAgICAgICAgICBmdW5jdGlvbnMgLyo6IEFycmF5PENsYXNzTWV0aG9kPiovID0gW107XG5cbiAgICBvYmplY3RFeHByZXNzaW9uLnByb3BlcnRpZXMuZm9yRWFjaCggKGNvbmZpZykgPT4ge1xuICAgICAgc3dpdGNoKGNvbmZpZy5rZXkubmFtZSkge1xuICAgICAgY2FzZSAnaXMnOlxuICAgICAgICBlbGVtZW50TmFtZSA9IGNvbmZpZy52YWx1ZS52YWx1ZTtcbiAgICAgICAgY2xhc3NOYW1lID0gdG9VcHBlckNhbWVsKGNvbmZpZy52YWx1ZS52YWx1ZSk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnUGFyc2luZyBQb2x5bWVyIGVsZW1lbnQnLCBlbGVtZW50TmFtZSwgJ2luJywgc3RhdGUuZmlsZS5vcHRzLmZpbGVuYW1lKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdleHRlbmRzJzpcbiAgICAgICAgZXh0ZW5kID0gY29uZmlnLnZhbHVlLnZhbHVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2JlaGF2aW9ycyc6XG4gICAgICAgIGJlaGF2aW9ycyA9IGNvbmZpZy52YWx1ZS5lbGVtZW50cy5tYXAocGFyc2VQb2x5bWVyQmVoYXZpb3JSZWZlcmVuY2UuYmluZCh1bmRlZmluZWQsIHN0YXRlLm9wdHMudXNlQmVoYXZpb3JEZWNvcmF0b3IpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdwcm9wZXJ0aWVzJzpcbiAgICAgICAgcHJvcGVydGllcyA9IGNvbmZpZy52YWx1ZS5wcm9wZXJ0aWVzLm1hcChwYXJzZVBvbHltZXJQcm9wZXJ0eSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnaG9zdEF0dHJpYnV0ZXMnOlxuICAgICAgICBob3N0QXR0cmlidXRlcyA9IGNvbmZpZy52YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdvYnNlcnZlcnMnOlxuICAgICAgICBvYnNlcnZlcnMgPSBwYXJzZVBvbHltZXJGdW5jdGlvblNpZ25hdHVyZVByb3BlcnRpZXMoY29uZmlnLnZhbHVlLmVsZW1lbnRzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdsaXN0ZW5lcnMnOlxuICAgICAgICBsaXN0ZW5lcnMgPSBwYXJzZVBvbHltZXJFdmVudExpc3RlbmVyUHJvcGVydGllcyhjb25maWcudmFsdWUucHJvcGVydGllcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaWYodC5pc09iamVjdE1ldGhvZChjb25maWcpKSB7XG4gICAgICAgICAgZnVuY3Rpb25zLnB1c2godC5jbGFzc01ldGhvZChjb25maWcua2luZCwgY29uZmlnLmtleSwgY29uZmlnLnBhcmFtcywgY29uZmlnLmJvZHksIGNvbmZpZy5jb21wdXRlZCwgY29uZmlnLnN0YXRpYykpO1xuICAgICAgICB9IGVsc2UgaWYodC5pc0Z1bmN0aW9uRXhwcmVzc2lvbihjb25maWcudmFsdWUpKSB7XG4gICAgICAgICAgbGV0IG1ldGhvZCA9IHBhcnNlTm9uUG9seW1lckZ1bmN0aW9uKGNvbmZpZyk7XG5cbiAgICAgICAgICBpZihtZXRob2Qua2V5Lm5hbWUgPT0gJ2ZhY3RvcnlJbXBsJykge1xuICAgICAgICAgICAgbWV0aG9kLmtleS5uYW1lID0gbWV0aG9kLmtpbmQgPSAnY29uc3RydWN0b3InO1xuICAgICAgICAgICAgY29uc3RydWN0b3IgPSBtZXRob2Q7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEFkZCBvYnNlcnZlciBkZWNvcmF0b3JzXG4gICAgICAgICAgICBsZXQgZnVuY3Rpb25PYnNlcnZlciA9IG9ic2VydmVyc1ttZXRob2Qua2V5Lm5hbWVdO1xuICAgICAgICAgICAgaWYoZnVuY3Rpb25PYnNlcnZlcikge1xuICAgICAgICAgICAgICBpZighbWV0aG9kLmRlY29yYXRvcnMpIHsgbWV0aG9kLmRlY29yYXRvcnMgPSBbXTsgfVxuICAgICAgICAgICAgICAgIG1ldGhvZC5kZWNvcmF0b3JzLnB1c2goZnVuY3Rpb25PYnNlcnZlcik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIEFkZCBsaXN0ZW5lciBkZWNvcmF0b3JzXG4gICAgICAgICAgICBsZXQgZnVuY3Rpb25MaXN0ZW5lcnMgPSBsaXN0ZW5lcnNbbWV0aG9kLmtleS5uYW1lXTtcbiAgICAgICAgICAgIGlmKGZ1bmN0aW9uTGlzdGVuZXJzKSB7XG4gICAgICAgICAgICAgIGZ1bmN0aW9uTGlzdGVuZXJzLmZvckVhY2goIChsaXN0ZW5lcikgPT4ge1xuICAgICAgICAgICAgICAgIGlmKCFtZXRob2QuZGVjb3JhdG9ycykgeyBtZXRob2QuZGVjb3JhdG9ycyA9IFtdOyB9XG4gICAgICAgICAgICAgICAgbWV0aG9kLmRlY29yYXRvcnMucHVzaChsaXN0ZW5lcik7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZnVuY3Rpb25zLnB1c2gobWV0aG9kKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodC5pc09iamVjdEV4cHJlc3Npb24pIHtcbiAgICAgICAgICBwcm9wZXJ0aWVzLnB1c2godC5jbGFzc1Byb3BlcnR5KHQuaWRlbnRpZmllcihjb25maWcua2V5Lm5hbWUpLCBjb25maWcudmFsdWUpKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjb25zb2xlLndhcm4oXCIhISEhISEhISEhISBVbmV4cGVjdGVkIHByb3BlcnR5OlwiLCBjb25maWcua2V5ICsgJzonLCBjb25maWcudmFsdWUpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBsZXQgZGVjb3JhdG9ycyA9IFtdXG4gICAgaWYoZWxlbWVudE5hbWUpIHtcbiAgICAgIGRlY29yYXRvcnMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2NvbXBvbmVudCcsIGVsZW1lbnROYW1lKSk7XG4gICAgICBpZihleHRlbmQpIHtcbiAgICAgICAgZGVjb3JhdG9ycy5wdXNoKGNyZWF0ZURlY29yYXRvcignZXh0ZW5kJywgZXh0ZW5kKSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmKGhvc3RBdHRyaWJ1dGVzKSB7XG4gICAgICBkZWNvcmF0b3JzLnB1c2goY3JlYXRlRGVjb3JhdG9yKCdob3N0QXR0cmlidXRlcycsIGhvc3RBdHRyaWJ1dGVzKSk7XG4gICAgfVxuICAgIGlmKGJlaGF2aW9ycyAmJiBzdGF0ZS5vcHRzLnVzZUJlaGF2aW9yRGVjb3JhdG9yKSB7XG4gICAgICBkZWNvcmF0b3JzID0gZGVjb3JhdG9ycy5jb25jYXQoYmVoYXZpb3JzKTtcbiAgICB9XG5cbiAgICAvLyBBZGQgYW55IHBvc3RDb25zdHJ1Y3RvclNldHRlcnMgKFBvbHltZXIgcHJvcGVydGllcyB3aXRoIGEgZnVuY3Rpb24gZm9yIGB2YWx1ZWApXG4gICAgbGV0IGNvbnN0dWN0b3JCb2R5IC8qOiBBcnJheTxTdGF0ZW1lbnQ+Ki8gPSBjb25zdHJ1Y3RvciA/IGNvbnN0cnVjdG9yLmJvZHkuYm9keSA6IFtdO1xuXG4gICAgZm9yKHZhciBrZXkgaW4gcG9zdENvbnN0dWN0U2V0dGVycykge1xuICAgICAgbGV0IHBvc3RDb25zdHVjdFNldHRlciAvKjogQmxvY2tTdGF0ZW1lbnQgfCBFeHByZXNzaW9uICovID0gcG9zdENvbnN0dWN0U2V0dGVyc1trZXldO1xuICAgICAgY29uc3R1Y3RvckJvZHkucHVzaCh0LmV4cHJlc3Npb25TdGF0ZW1lbnQoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5Bc3NpZ25tZW50RXhwcmVzc2lvbignPScsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0Lm1lbWJlckV4cHJlc3Npb24odC50aGlzRXhwcmVzc2lvbigpLCB0LmlkZW50aWZpZXIoa2V5KSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmNhbGxFeHByZXNzaW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmFycm93RnVuY3Rpb25FeHByZXNzaW9uKFtdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYmxvY2tTdGF0ZW1lbnQocG9zdENvbnN0dWN0U2V0dGVyKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgfVxuICAgIGlmKGNvbnN0dWN0b3JCb2R5Lmxlbmd0aCkge1xuICAgICAgcHJvcGVydGllcy5wdXNoKGNvbnN0cnVjdG9yIHx8IHQuY2xhc3NNZXRob2QoJ2NvbnN0cnVjdG9yJywgdC5pZGVudGlmaWVyKCdjb25zdHJ1Y3RvcicpLCBbXSwgdC5ibG9ja1N0YXRlbWVudChjb25zdHVjdG9yQm9keSkpKTtcbiAgICB9XG5cbiAgICBhZGRUeXBlRGVmaW5pdGlvblJlZmVyZW5jZShwYXRoLCBzdGF0ZSk7XG5cbiAgICBpZihtZW1iZXJFeHByZXNzaW9uKSB7XG4gICAgICBjbGFzc05hbWUgPSBtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWU7XG4gICAgfVxuXG4gICAgbGV0IGNsYXNzRGVjbGFyYXRpb24gPSB0LmNsYXNzRGVjbGFyYXRpb24odC5pZGVudGlmaWVyKGNsYXNzTmFtZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5tZW1iZXJFeHByZXNzaW9uKHQuaWRlbnRpZmllcigncG9seW1lcicpLCB0LmlkZW50aWZpZXIoJ0Jhc2UnKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5jbGFzc0JvZHkocHJvcGVydGllcy5jb25jYXQoZnVuY3Rpb25zKSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVjb3JhdG9ycyk7XG5cbiAgICBpZihiZWhhdmlvcnMgJiYgIXN0YXRlLm9wdHMudXNlQmVoYXZpb3JEZWNvcmF0b3IpIHtcbiAgICAgIGNsYXNzRGVjbGFyYXRpb24uaW1wbGVtZW50cyA9IGJlaGF2aW9ycy5tYXAoIChiZWhhdmlvcikgPT4ge1xuICAgICAgICByZXR1cm4gdC5jbGFzc0ltcGxlbWVudHMoYmVoYXZpb3IpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYobWVtYmVyRXhwcmVzc2lvbikge1xuLy9UT0RPOiBleHBvcnQgY2xhc3MsIG1vZHVsZSBvbiBzYW1lIGxpbmUgYXMgUG9seW1lclxuLy8gICAgICBsZXQgbW9kdWxlID0gdC5kZWNsYXJlTW9kdWxlKHQuaWRlbnRpZmllcihtZW1iZXJFeHByZXNzaW9uLm9iamVjdC5uYW1lKSxcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmJsb2NrU3RhdGVtZW50KFtjbGFzc0RlY2xhcmF0aW9uXSkpO1xuICAgICAgbGV0IG1vZHVsZSA9IHQuYmxvY2tTdGF0ZW1lbnQoW2NsYXNzRGVjbGFyYXRpb25dKTtcblxuICAgICAgcGF0aC5wYXJlbnRQYXRoLnJlcGxhY2VXaXRoTXVsdGlwbGUoW3QuaWRlbnRpZmllcignbW9kdWxlJyksIHQuaWRlbnRpZmllcignUG9seW1lcicpLCBtb2R1bGVdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcGF0aC5wYXJlbnRQYXRoLnJlcGxhY2VXaXRoKGNsYXNzRGVjbGFyYXRpb24pO1xuXG4gICAgICBwYXRoLnBhcmVudFBhdGguaW5zZXJ0QWZ0ZXIodC5leHByZXNzaW9uU3RhdGVtZW50KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5jYWxsRXhwcmVzc2lvbihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5tZW1iZXJFeHByZXNzaW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuaWRlbnRpZmllcihjbGFzc05hbWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuaWRlbnRpZmllcigncmVnaXN0ZXInKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBldmFsdWF0ZUZ1bmN0aW9uRXhwcmVzc2lvbihmdW5jdGlvbkV4cHJlc3Npb24pIHtcbiAgICB2YXIgbmFtZWRTdGF0ZW1lbnRzID0ge30sXG4gICAgICByZXN1bHQ7XG5cbiAgICBmdW5jdGlvbkV4cHJlc3Npb24uYm9keS5ib2R5LmZvckVhY2goIChzdGF0ZW1lbnQpID0+IHtcbiAgICAgIGlmICh0LmlzUmV0dXJuU3RhdGVtZW50KHN0YXRlbWVudCkpIHtcbiAgICAgICAgcmVzdWx0ID0gc3RhdGVtZW50LmFyZ3VtZW50OyAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKHN0YXRlbWVudCkpIHtcbiAgICAgICAgbmFtZWRTdGF0ZW1lbnRzW3N0YXRlbWVudC5pZC5uYW1lXSA9IHQuZnVuY3Rpb25FeHByZXNzaW9uKG51bGwsIHN0YXRlbWVudC5wYXJhbXMsIHN0YXRlbWVudC5ib2R5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJlc3VsdC5wcm9wZXJ0aWVzLmZvckVhY2goIChwcm9wZXJ0eSkgPT4ge1xuICAgICAgaWYgKHQuaXNJZGVudGlmaWVyKHByb3BlcnR5LnZhbHVlKSkge1xuICAgICAgICBsZXQgc3RhdGVtZW50ID0gbmFtZWRTdGF0ZW1lbnRzW3Byb3BlcnR5LnZhbHVlLm5hbWVdO1xuICAgICAgICBpZiAoc3RhdGVtZW50ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwcm9wZXJ0eS52YWx1ZSA9IHN0YXRlbWVudDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdmlzaXRvcjoge1xuICAgICAgQ2FsbEV4cHJlc3Npb24ocGF0aCwgc3RhdGUpIHtcbiAgICAgICAgb2JzZXJ2ZXJzID0ge307XG4gICAgICAgIGxpc3RlbmVycyA9IHt9O1xuICAgICAgICBwb3N0Q29uc3R1Y3RTZXR0ZXJzID0ge307XG5cbiAgICAgICAgLy8gRm9yIHNvbWUgcmVhc29uIHdlIHZpc2l0IGVhY2ggaWRlbnRpZmllciB0d2ljZVxuICAgICAgICBpZihwYXRoLm5vZGUuY2FsbGVlLnN0YXJ0ICE9IHN0YXJ0KSB7XG4gICAgICAgICAgc3RhcnQgPSBwYXRoLm5vZGUuY2FsbGVlLnN0YXJ0O1xuXG4gICAgICAgICAgaWYgKCFwYXRoLm5vZGUuY2FsbGVlLm5hbWUgJiYgdC5pc0Z1bmN0aW9uRXhwcmVzc2lvbihwYXRoLm5vZGUuY2FsbGVlKSkge1xuICAgICAgICAgICAgLy8gYW5vbnltb3VzIGZ1bmN0aW9uIC0gd29uJ3QgYmUgYWJsZSB0byBnZW5lcmF0ZSAuZC50c1xuICAgICAgICAgICAgdmFyIGJvZHlOb2RlcyA9IHBhdGgubm9kZS5jYWxsZWUuYm9keS5ib2R5O1xuICAgICAgICAgICAgcGF0aC5yZXBsYWNlV2l0aChib2R5Tm9kZXNbMF0pO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBib2R5Tm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgcGF0aC5wYXJlbnRQYXRoLmluc2VydEFmdGVyKGJvZHlOb2Rlc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoLm5vZGUuY2FsbGVlLm5hbWUgPT0gJ1BvbHltZXInKSB7XG4gICAgICAgICAgICBsZXQgbWVtYmVyRXhwcmVzc2lvbiA9IHQuaXNBc3NpZ25tZW50RXhwcmVzc2lvbihwYXRoLnBhcmVudCkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuaXNNZW1iZXJFeHByZXNzaW9uKHBhdGgucGFyZW50LmxlZnQpID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGgucGFyZW50LmxlZnQgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgLy9tb2R1bGUgPSBwYXRoLnBhcmVudC5sZWZ0Lm9iamVjdC5uYW1lO1xuICAgICAgICAgICAgICAgIC8vIHBhdGgucGFyZW50LmxlZnQucHJvcGVydHkubmFtZVxuXG4gICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhwYXRoLm5vZGUuYXJndW1lbnRzWzBdLCBwYXRoLCBzdGF0ZSwgbWVtYmVyRXhwcmVzc2lvbik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBBc3NpZ25tZW50RXhwcmVzc2lvbihwYXRoLCBzdGF0ZSkge1xuICAgICAgICBpZih0LmlzTWVtYmVyRXhwcmVzc2lvbihwYXRoLm5vZGUubGVmdCkpIHtcbiAgICAgICAgICBpZihwYXRoLm5vZGUubGVmdC5vYmplY3QubmFtZSA9PSAnUG9seW1lcicpIHtcbiAgICAgICAgICAgIGxldCBjbGFzc05hbWUgPSBwYXRoLm5vZGUubGVmdC5vYmplY3QubmFtZSArICcuJyArIHBhdGgubm9kZS5sZWZ0LnByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1BhcnNpbmcgUG9seW1lciBiZWhhdmlvcicsIGNsYXNzTmFtZSwgJ2luJywgc3RhdGUuZmlsZS5vcHRzLmZpbGVuYW1lKTtcbiAgICAgICAgICAgIGlmKHQuaXNDYWxsRXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG5jb25zb2xlLmluZm8oJy4uLi4uLi4uLi4gQ2FsbCB3aXRoaW4gYXNzaWdubWVudCcsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4gICAgICAgICAgICAgIC8vaWYocGF0aC5ub2RlLnJpZ2h0LmNhbGxlZS5uYW1lID09ICdQb2x5bWVyJykge1xuICAgICAgICAgICAgICAvLyAgcGFyc2VQb2x5bWVyQ2xhc3MocGF0aC5ub2RlLnJpZ2h0LmFyZ3VtZW50c1swXSwgcGF0aCwgc3RhdGUpOyAvLywgcGF0aC5ub2RlLmxlZnQpO1xuICAgICAgICAgICAgICAvL30gZWxzZSBpZih0LmlzRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpKSB7XG4gICAgICAgICAgICAgIC8vICBsZXQgZXhwcmVzc2lvbiA9IGV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpO1xuICAgICAgICAgICAgICAvLyAgcGFyc2VQb2x5bWVyQ2xhc3MoZXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIHBhdGgubm9kZS5sZWZ0KTtcbiAgICAgICAgICAgICAgLy99XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc09iamVjdEV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0KSkge1xuICAgICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc0FycmF5RXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG4gICAgICAgICAgICAgIHBhcnNlUG9seW1lckJlaGF2aW9yRGVmaW5pdGlvbihwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nUGF0aChwYXRoKSB7XG4gIGZvcih2YXIgcHJvcE5hbWUgaW4gcGF0aCkge1xuICAgIGlmKHBhdGguaGFzT3duUHJvcGVydHkocHJvcE5hbWUpXG4gICAgICAmJiBwcm9wTmFtZSAhPSAncGFyZW50UGF0aCcgJiYgcHJvcE5hbWUgIT0gJ3BhcmVudCdcbiAgICAgICYmIHByb3BOYW1lICE9ICdodWInXG4gICAgICAmJiBwcm9wTmFtZSAhPSAnY29udGFpbmVyJykge1xuICAgICAgY29uc29sZS5sb2cocHJvcE5hbWUsIHBhdGhbcHJvcE5hbWVdKTtcbiAgICB9XG4gIH1cbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
