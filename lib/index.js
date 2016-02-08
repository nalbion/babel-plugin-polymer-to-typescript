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
            case '*':
                return t.typeAnnotation(t.anyTypeAnnotation());
            case 'object':
            default:
                if (type.indexOf('function') == 0) {
                    type = type.replace(/^function\(/, '(');
                    if (type.indexOf(':') > 0) {
                        type = type.replace(/:/, ' => ');
                    }
                    else {
                        type = type + ' => void';
                    }
                }
                else if (name) {
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
                    var typedParam = typedParams[i], match = typedParam.match(/{[!\?]?([^=}]+)(=?)} (\S+)/), paramName = match[3];
                    if (params[i] && params[i].name == paramName) {
                        parseTypeFromComments(match, paramName, params[i]);
                    }
                    else {
                        console.warn('param', i, '(' + params[i] + ') !=', paramName);
                    }
                }
            }
            method.leadingComments = node.leadingComments;
        }
        return method;
    }
    function parseTypeFromComments(match, paramName, result) {
        if (!!match[2]) {
            result.optional = true;
        }
        // remove 'undefined', 'null' and fix '<!'
        var type = match[1].replace(/\b(undefined|null)\b/g, '')
            .replace(/\|{2,}/g, '|')
            .replace(/^\||\|$/g, '')
            .replace(/<!/, '<');
        result.typeAnnotation = createTypeAnnotation(type);
        return result;
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
            var match = property.leadingComments[0].value.match(/@type {[!\?]?(?!hydrolysis)([^=}]+)(=?)}/);
            if (match) {
                var typeResult = parseTypeFromComments(match, name, {});
                type = typeResult.typeAnnotation;
                if (typeResult.optional) {
                }
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
        'paper-ripple-behavior': 'paper-behaviors',
        'neon-animatable-behavior': 'neon-animation',
        'neon-shared-element-animation-behavior': 'neon-animation'
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
            var behavior = dtsFileName.indexOf('-behavior');
            if (behavior > 0) {
                return getPathForPolymerFileName(filePath, dtsFileName.substring(0, behavior));
            }
            else {
                console.info('!!!!!!!!!!!!!!!!!!!!!!!!! failed to find path for', dtsFileName);
            }
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
        // skip templatizer behavior, used by iron-list
        if (dtsFileName && dtsFileName.indexOf('-') < 0) {
            return;
        }
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
      The implementation of this probably isn't spot on, for now I just want to extract enough to generate .d.ts files
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
    function parsePolymerClass(objectExpression, path, state, memberExpression, isInterface) {
        if (isInterface === void 0) { isInterface = false; }
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
        if (behaviors) {
            behaviors.forEach(function (behavior) {
                addTypeDefinitionReference(path, state, toDashCase(behavior.property.name));
            });
        }
        if (memberExpression) {
            className = memberExpression.property.name;
        }
        var classDeclaration;
        if (isInterface) {
            properties.forEach(function (prop) {
                delete prop.decorators;
                delete prop.value;
            });
            functions.forEach(function (prop) {
                delete prop.decorators;
                delete prop.body;
            });
            classDeclaration = t.interfaceDeclaration(t.identifier(className), null /*typeParameters*/, [], t.classBody(properties.concat(functions)));
        }
        else {
            classDeclaration = t.classDeclaration(t.identifier(className), t.memberExpression(t.identifier('polymer'), t.identifier('Base')), t.classBody(properties.concat(functions)), decorators);
        }
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
                        parsePolymerClass(path.node.arguments[0], path, state, memberExpression, false);
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
                            parsePolymerClass(path.node.right, path, state, path.node.left, true);
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbInRvRGFzaENhc2UiLCJ0b1VwcGVyQ2FtZWwiLCJjcmVhdGVEZWNvcmF0b3IiLCJjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eSIsImNyZWF0ZVR5cGVBbm5vdGF0aW9uIiwicGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzIiwicGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMiLCJwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSIsImd1ZXNzVHlwZUZyb21OYW1lIiwicGFyc2VOb25Qb2x5bWVyRnVuY3Rpb24iLCJwYXJzZVR5cGVGcm9tQ29tbWVudHMiLCJwYXJzZVBvbHltZXJQcm9wZXJ0eSIsImdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUiLCJ2ZXJpZnlQYXRoRXhpc3RzIiwiYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UiLCJwYXJzZVBvbHltZXJCZWhhdmlvckRlZmluaXRpb24iLCJwYXJzZVBvbHltZXJDbGFzcyIsImV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uIiwiQ2FsbEV4cHJlc3Npb24iLCJBc3NpZ25tZW50RXhwcmVzc2lvbiIsImxvZ1BhdGgiXSwibWFwcGluZ3MiOiJBQUFBLGtDQUFrQztBQUVsQyxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxPQUFPLEVBQUUsQ0FBQztBQUV4QyxJQUFPLEVBQUUsV0FBVyxJQUFJLENBQUMsQ0FBQztBQUUxQixtQkFBd0IsRUFBWTtRQUFILENBQUM7SUFDakMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxDQUFDLEVBQ1QsU0FBUyxHQUFHLEVBQUUsRUFDZCxTQUFTLEdBQUcsRUFBRSxFQUNkLG1CQUFtQixHQUFHLEVBQUUsQ0FBQztJQUU3QixvQkFBb0IsR0FBVztRQUM3QkEsTUFBTUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsT0FBT0EsQ0FBQ0Esa0JBQWtCQSxFQUFFQSxVQUFTQSxFQUFFQSxFQUFFQSxFQUFFQSxFQUFFQSxFQUFFQSxJ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LEdBQUdBLENBQUFBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pCQSxFQUFFQSxDQUFBQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxDQUFDQTtlQUMzQkEsUUFBUUEsSUFBSUEsWUFBWUEsSUFBSUEsUUFBUUEsSUFBSUEsUUFBUUE7ZUFDaERBLFFBQVFBLElBQUlBLEtBQUtBO2VBQ2pCQSxRQUFRQSxJQUFJQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO0lBQ0hBLENBQUNBO0FBQ0hBLENBQUNBIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8vIDxyZWZlcmVuY2UgcGF0aD1cIm5vZGUuZC50c1wiIC8+XG5kZWNsYXJlIGZ1bmN0aW9uIHJlcXVpcmUobmFtZTogc3RyaW5nKTtcbnJlcXVpcmUoJ3NvdXJjZS1tYXAtc3VwcG9ydCcpLmluc3RhbGwoKTtcblxuaW1wb3J0IGZzID0gcmVxdWlyZSgnZnMnKTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oeyB0eXBlczogdCB9KSB7XG5cdHZhciBzdGFydCA9IC0xLFxuICAgICAgb2JzZXJ2ZXJzID0ge30sXG4gICAgICBsaXN0ZW5lcnMgPSB7fSxcbiAgICAgIHBvc3RDb25zdHVjdFNldHRlcnMgPSB7fTtcblxuICBmdW5jdGlvbiB0b0Rhc2hDYXNlKHN0cjogc3RyaW5nKXtcbiAgICByZXR1cm4gc3RyLnJlcGxhY2UoLyhbYS16XSspKFtBLVpdKS9nLCBmdW5jdGlvbigkMCwgJDEsICQyKXtyZXR1cm4gJDEgKyAnLScgKyAkMjt9KS50b0xvd2VyQ2FzZSgpO1xuICB9ICAgIFxuXG4gIGZ1bmN0aW9uIHRvVXBwZXJDYW1lbChzdHI6IHN0cmluZyl7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eW2Etel18KFxcLVthLXpdKS9nLCBmdW5jdGlvbigkMSl7cmV0dXJuICQxLnRvVXBwZXJDYXNlKCkucmVwbGFjZSgnLScsJycpO30pO1xuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRGVjb3JhdG9yKG5hbWU6IHN0cmluZywgdmFsdWUpIHtcbiAgICAgIHJldHVybiB0LmRlY29yYXRvcih0LmNhbGxFeHByZXNzaW9uKHQuaWRlbnRpZmllcihuYW1lKSxcbiAgICAgICAgICAgICAgW3R5cGVvZiB2YWx1ZSA9PSAnc3RyaW5nJyA/IHQuc3RyaW5nTGl0ZXJhbCh2YWx1ZSkgOiB2YWx1ZV0pKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG4gICAgc3dpdGNoKHR5cGVvZiB2YWx1ZSkge1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICByZXR1cm4gdC5vYmplY3RQcm9wZXJ0eShcbiAgICAgICAgdC5pZGVudGlmaWVyKGtleSksXG4gICAgICAgIHZhbHVlXG4gICAgICApO1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgdmFsdWUgPSB2YWx1ZS50b1N0cmluZygpO1xuICAgIH1cbiAgICByZXR1cm4gdC5vYmplY3RQcm9wZXJ0eShcbiAgICAgIHQuaWRlbnRpZmllcihrZXkpLFxuICAgICAgdC5pZGVudGlmaWVyKHZhbHVlKVxuICAgICk7XG4gIH1cblxuICAvKiogQHBhcmFtIHR5cGUgLSBvbmUgb2YgQm9vbGVhbiwgRGF0ZSwgTnVtYmVyLCBTdHJpbmcsIEFycmF5IG9yIE9iamVjdCAqL1xuICBmdW5jdGlvbiBjcmVhdGVUeXBlQW5ub3RhdGlvbih0eXBlOiBzdHJpbmcsIG5hbWU/OiBzdHJpbmcsIGVsZW1lbnRUeXBlID0gJ2FueScpIHtcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnISEhISEhISEhISEhISEhISEhIG5vIHR5cGUgZm9yJywgbmFtZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHN3aXRjaCh0eXBlLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5zdHJpbmdUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIC8vIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuYm9vbGVhblR5cGVBbm5vdGF0aW9uKCkpO1xuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5nZW5lcmljVHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKCdib29sZWFuJykpKTtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuZGF0ZVR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0Lm51bWJlclR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuYXJyYXlUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoZWxlbWVudFR5cGUpKSk7XG4gICAgY2FzZSAnKic6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmFueVR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIGlmICh0eXBlLmluZGV4T2YoJ2Z1bmN0aW9uJykgPT0gMCkge1xuICAgICAgICB0eXBlID0gdHlwZS5yZXBsYWNlKC9eZnVuY3Rpb25cXCgvLCAnKCcpO1xuICAgICAgICBpZiAodHlwZS5pbmRleE9mKCc6JykgPiAwKSB7XG4gICAgICAgICAgdHlwZSA9IHR5cGUucmVwbGFjZSgvOi8sICcgPT4gJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHlwZSA9IHR5cGUgKyAnID0+IHZvaWQnO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKG5hbWUpIHtcbiAgICAgICAgbGV0IGd1ZXNzZWRUeXBlID0gZ3Vlc3NUeXBlRnJvbU5hbWUobmFtZSk7XG4gICAgICAgIGlmIChndWVzc2VkVHlwZSkge1xuICAgICAgICAgIHJldHVybiBjcmVhdGVUeXBlQW5ub3RhdGlvbihndWVzc2VkVHlwZSk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuXG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmdlbmVyaWNUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIodHlwZSkpKTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJGdW5jdGlvblNpZ25hdHVyZVByb3BlcnRpZXMoZWxlbWVudHMpIHtcbiAgICByZXR1cm4gZWxlbWVudHMucmVkdWNlKCAocmVzdWx0cywgc2lnbmF0dXJlKSA9PiB7XG4gICAgICAvLyBqb2luIG11bHRpLWxpbmUgc3RyaW5nc1xuICAgICAgbGV0IHZhbHVlID0gJyc7XG4gICAgICB3aGlsZSh0LmlzQmluYXJ5RXhwcmVzc2lvbihzaWduYXR1cmUpKSB7XG4gICAgICAgIC8vIHZhbHVlID0gKChzaWduYXR1cmUubGVmdC52YWx1ZSB8fCBzaWduYXR1cmUubGVmdC5yaWdodC52YWx1ZSkgKyBzaWduYXR1cmUucmlnaHQudmFsdWU7XG4gICAgICAgIHZhbHVlID0gc2lnbmF0dXJlLnJpZ2h0LnZhbHVlICsgdmFsdWU7XG4gICAgICAgIHNpZ25hdHVyZSA9IHNpZ25hdHVyZS5sZWZ0O1xuICAgICAgfVxuICAgICAgdmFsdWUgPSBzaWduYXR1cmUudmFsdWUgKyB2YWx1ZTtcblxuICAgICAgbGV0IG1hdGNoID0gdmFsdWUubWF0Y2goLyhbXlxcKF0rKVxcKChbXlxcKV0rKS8pLFxuICAgICAgICBmdW5jdGlvbk5hbWUgPSBtYXRjaFsxXSxcbiAgICAgICAgb2JzZXJ2ZWRQcm9wZXJ0aWVzID0gbWF0Y2hbMl07XG4gICAgICByZXN1bHRzW2Z1bmN0aW9uTmFtZV0gPSBjcmVhdGVEZWNvcmF0b3IoJ29ic2VydmUnLCBvYnNlcnZlZFByb3BlcnRpZXMpO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSwge30pO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMocHJvcGVydGllcykge1xuICAgIHJldHVybiBwcm9wZXJ0aWVzLnJlZHVjZSggKHJlc3VsdHMsIHByb3BlcnR5KSA9PiB7XG4gICAgICBsZXQgZXZlbnROYW1lID0gcHJvcGVydHkua2V5LnZhbHVlIHx8IHByb3BlcnR5LmtleS5uYW1lLFxuICAgICAgICAgIGZ1bmN0aW9uTmFtZSA9IHByb3BlcnR5LnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGZ1bmN0aW9uRXZlbnRzID0gcmVzdWx0c1tmdW5jdGlvbk5hbWVdO1xuICAgICAgaWYoIWZ1bmN0aW9uRXZlbnRzKSB7XG4gICAgICAgIGZ1bmN0aW9uRXZlbnRzID0gcmVzdWx0c1tmdW5jdGlvbk5hbWVdID0gW107XG4gICAgICB9XG4gICAgICBmdW5jdGlvbkV2ZW50cy5wdXNoKGNyZWF0ZURlY29yYXRvcignbGlzdGVuJywgZXZlbnROYW1lKSk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9LCB7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSh1c2VCZWhhdmlvckRlY29yYXRvciwgbm9kZSkge1xuICAgIHJldHVybiB1c2VCZWhhdmlvckRlY29yYXRvciA/IGNyZWF0ZURlY29yYXRvcignYmVoYXZpb3InLCBub2RlKSA6IG5vZGU7XG4gIH1cblxuICBmdW5jdGlvbiBndWVzc1R5cGVGcm9tTmFtZShuYW1lOiBzdHJpbmcpIHtcbiAgICB2YXIgdHlwZTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXihvcHRfKT9pc1tBLVpdLykpIHtcbiAgICAgIHR5cGUgPSAnYm9vbGVhbic7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN3aXRjaCAobmFtZSkge1xuICAgICAgICBjYXNlICdlbCc6XG4gICAgICAgICAgdHlwZSA9ICdIVE1MRWxlbWVudCc7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2V2ZW50JzpcbiAgICAgICAgICB0eXBlID0gJ0V2ZW50JztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAna2V5Ym9hcmRFdmVudCc6XG4gICAgICAgICAgdHlwZSA9ICdLZXlib2FyZEV2ZW50JztcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBpZiAobmFtZS5tYXRjaCgvRWxlbWVudCQvKSkge1xuICAgICAgICAgICAgdHlwZSA9ICdIVE1MRWxlbWVudCc7XG4gICAgICAgICAgfSBlbHNlIGlmIChuYW1lLm1hdGNoKC8oU3RyaW5nfE5hbWUpJC8pKSB7XG4gICAgICAgICAgICB0eXBlID0gJ3N0cmluZyc7XG4gICAgICAgICAgfSBlbHNlIGlmIChuYW1lLm1hdGNoKC9FdmVudFRhcmdldCQvKSkge1xuICAgICAgICAgICAgdHlwZSA9ICdFdmVudFRhcmdldCc7XG4gICAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTm9uUG9seW1lckZ1bmN0aW9uKG5vZGUpIHtcbiAgICBsZXQgbmFtZSA9IG5vZGUua2V5Lm5hbWUsXG4gICAgICBwYXJhbXMgPSBub2RlLnZhbHVlLnBhcmFtcyxcbiAgICAgIGJvZHkgLyo6IEFycmF5PFN0YXRlbWVudCAqLyA9IG5vZGUudmFsdWUuYm9keS5ib2R5O1xuXG4gICAgbGV0IG1ldGhvZCA9IHQuY2xhc3NNZXRob2QoJ21ldGhvZCcsIHQuaWRlbnRpZmllcihuYW1lKSwgcGFyYW1zLCB0LmJsb2NrU3RhdGVtZW50KGJvZHkpKTtcblxuICAgIC8vIEF0dGVtcHQgdG8gZ3Vlc3MgdGhlIHR5cGVzIGZyb20gcGFyYW1ldGVyIG5hbWVzXG4gICAgaWYgKHBhcmFtcykge1xuICAgICAgcGFyYW1zLmZvckVhY2goIChwYXJhbSkgPT4ge1xuICAgICAgICBwYXJhbS5vcHRpb25hbCA9ICEhcGFyYW0ubmFtZS5tYXRjaCgvXm9wdC8pO1xuXG4gICAgICAgIGxldCB0eXBlID0gZ3Vlc3NUeXBlRnJvbU5hbWUocGFyYW0ubmFtZSk7XG4gICAgICAgIGlmICh0eXBlKSB7XG4gICAgICAgICAgcGFyYW0udHlwZUFubm90YXRpb24gPSBjcmVhdGVUeXBlQW5ub3RhdGlvbih0eXBlKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gU29tZSBmdW5jdGlvbnMgaGF2ZSBKU0RvYyBhbm5vdGF0aW9uc1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVycy5nb29nbGUuY29tL2Nsb3N1cmUvY29tcGlsZXIvZG9jcy9qcy1mb3ItY29tcGlsZXIjdHlwZXNcbiAgICBpZiAobm9kZS5sZWFkaW5nQ29tbWVudHMpIHtcbiAgICAgIGxldCB0eXBlZFBhcmFtcyA9IG5vZGUubGVhZGluZ0NvbW1lbnRzWzBdLnZhbHVlLm1hdGNoKC9AcGFyYW0ge1tefV0rfSBcXFMrL2cpO1xuICAgICAgaWYgKHR5cGVkUGFyYW1zKSB7XG4gICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgdHlwZWRQYXJhbXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBsZXQgdHlwZWRQYXJhbSA9IHR5cGVkUGFyYW1zW2ldLFxuICAgICAgICAgICAgICBtYXRjaCA9IHR5cGVkUGFyYW0ubWF0Y2goL3tbIVxcP10/KFtePX1dKykoPT8pfSAoXFxTKykvKSxcbiAgICAgICAgICAgICAgcGFyYW1OYW1lID0gbWF0Y2hbM107XG5cbiAgICAgICAgICBpZiAocGFyYW1zW2ldICYmIHBhcmFtc1tpXS5uYW1lID09IHBhcmFtTmFtZSkge1xuICAgICAgICAgICAgcGFyc2VUeXBlRnJvbUNvbW1lbnRzKG1hdGNoLCBwYXJhbU5hbWUsIHBhcmFtc1tpXSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybigncGFyYW0nLCBpLCAnKCcgKyBwYXJhbXNbaV0gKyAnKSAhPScsIHBhcmFtTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIG1ldGhvZC5sZWFkaW5nQ29tbWVudHMgPSBub2RlLmxlYWRpbmdDb21tZW50cztcbiAgICB9XG5cbiAgICByZXR1cm4gbWV0aG9kO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VUeXBlRnJvbUNvbW1lbnRzKG1hdGNoOiBSZWdFeHBNYXRjaEFycmF5LCBwYXJhbU5hbWU6IHN0cmluZywgcmVzdWx0OiBhbnkpIHtcbiAgICBpZiAoISFtYXRjaFsyXSkge1xuICAgICAgcmVzdWx0Lm9wdGlvbmFsID0gdHJ1ZTtcbiAgICB9XG5cbiAgICAvLyByZW1vdmUgJ3VuZGVmaW5lZCcsICdudWxsJyBhbmQgZml4ICc8ISdcbiAgICBsZXQgdHlwZSA9IG1hdGNoWzFdLnJlcGxhY2UoL1xcYih1bmRlZmluZWR8bnVsbClcXGIvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcfHsyLH0vZywgJ3wnKVxuICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9eXFx8fFxcfCQvZywgJycpXG4gICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLzwhLywgJzwnKTtcblxuICAgIHJlc3VsdC50eXBlQW5ub3RhdGlvbiA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKHR5cGUpO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lclByb3BlcnR5KHByb3BlcnR5KSAvKjogQ2xhc3NQcm9wZXJ0eSAqLyB7XG4gICAgbGV0IG5hbWU6IHN0cmluZyA9IHByb3BlcnR5LmtleS5uYW1lLFxuICAgICAgICBhdHRyaWJ1dGVzID0gcHJvcGVydHkudmFsdWUucHJvcGVydGllcyxcbiAgICAgICAgdHlwZSwgdmFsdWUsIGlzRnVuY3Rpb24sIHBhcmFtcywgcmVhZG9ubHkgPSBmYWxzZSwgZGVjb3JhdG9yUHJvcHMgPSBbXTtcblxuICAgIGlmKHQuaXNJZGVudGlmaWVyKHByb3BlcnR5LnZhbHVlKSkge1xuICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKHByb3BlcnR5LnZhbHVlLm5hbWUsIG5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhdHRyaWJ1dGVzLmZvckVhY2goIChhdHRyaWJ1dGUpID0+IHtcbiAgICAgICAgbGV0IGF0dHJfbmFtZTogc3RyaW5nID0gYXR0cmlidXRlLmtleS5uYW1lO1xuICAgICAgICBzd2l0Y2goYXR0cl9uYW1lKSB7XG4gICAgICAgIGNhc2UgJ3R5cGUnOlxuICAgICAgICAgIC8vIG9uZSBvZiBCb29sZWFuLCBEYXRlLCBOdW1iZXIsIFN0cmluZywgQXJyYXkgb3IgT2JqZWN0XG4gICAgICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKGF0dHJpYnV0ZS52YWx1ZS5uYW1lLCBuYW1lKTtcbiAgICAgICAgICBkZWNvcmF0b3JQcm9wcy5wdXNoKGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGF0dHJfbmFtZSwgYXR0cmlidXRlLnZhbHVlLm5hbWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAndmFsdWUnOlxuICAgICAgICAgIC8vIERlZmF1bHQgdmFsdWUgZm9yIHRoZSBwcm9wZXJ0eVxuICAgICAgICAgIHZhbHVlID0gYXR0cmlidXRlLnZhbHVlO1xuICAgICAgICAgIC8vZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZSkpO1xuICAgICAgICAgIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICBpc0Z1bmN0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHBhcmFtcyA9IFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZih0eXBlID09PSB1bmRlZmluZWQgJiYgIXQuaXNOdWxsTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIGlmICh0LmlzQ2FsbEV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIC8vIFRPRE86IGRldGVybWluZSBhY3R1YWwgdHlwZVxuICAgICAgICAgICAgICB0eXBlID0gdC50eXBlQW5ub3RhdGlvbih0LmdlbmVyaWNUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoJ29iamVjdCcpKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSB0LnR5cGVBbm5vdGF0aW9uKHQuZnVuY3Rpb25UeXBlQW5ub3RhdGlvbigpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHR5cGUgPSB0LmNyZWF0ZVR5cGVBbm5vdGF0aW9uQmFzZWRPblR5cGVvZih2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWFkT25seSc6XG4gICAgICAgICAgcmVhZG9ubHkgPSB0cnVlO1xuICAgICAgICAgIC8vIGZhbGwtdGhyb3VnaFxuICAgICAgICBjYXNlICdyZWZsZWN0VG9BdHRyaWJ1dGUnOlxuICAgICAgICBjYXNlICdub3RpZnknOlxuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCBhdHRyaWJ1dGUudmFsdWUudmFsdWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29tcHV0ZWQnOlxuICAgICAgICBjYXNlICdvYnNlcnZlcic6XG4gICAgICAgICAgLy8gY29tcHV0ZWQgZnVuY3Rpb24gY2FsbCAoYXMgc3RyaW5nKSAgICAgICAgO1xuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCAnXFwnJyArIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSArICdcXCcnKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgY29uc29sZS53YXJuKCdVbmV4cGVjdGVkIHByb3BlcnR5IGF0dHJpYnV0ZTogJywgYXR0cmlidXRlLmtleS5uYW1lLCAnYXQgbGluZScsIGF0dHJpYnV0ZS5sb2Muc3RhcnQubGluZSk7XG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBsZXQgZGVjb3JhdG9ycyA9IFt0LmRlY29yYXRvcihcbiAgICAgICAgICB0LmNhbGxFeHByZXNzaW9uKFxuICAgICAgICAgICAgdC5pZGVudGlmaWVyKCdwcm9wZXJ0eScpLFxuICAgICAgICAgICAgW3Qub2JqZWN0RXhwcmVzc2lvbihkZWNvcmF0b3JQcm9wcyldXG4gICAgICAgICAgKVxuICAgICAgICApXTtcblxuICAgIGlmIChwcm9wZXJ0eS5sZWFkaW5nQ29tbWVudHMpIHtcbiAgICAgIGxldCBtYXRjaCA9IHByb3BlcnR5LmxlYWRpbmdDb21tZW50c1swXS52YWx1ZS5tYXRjaCgvQHR5cGUge1shXFw/XT8oPyFoeWRyb2x5c2lzKShbXj19XSspKD0/KX0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICBsZXQgdHlwZVJlc3VsdCA9IHBhcnNlVHlwZUZyb21Db21tZW50cyhtYXRjaCwgbmFtZSwge30pO1xuICAgICAgICB0eXBlID0gdHlwZVJlc3VsdC50eXBlQW5ub3RhdGlvbjtcbiAgICAgICAgaWYgKHR5cGVSZXN1bHQub3B0aW9uYWwpIHtcbiAgICAgICAgICAvL3R5cGUub3B0aW9uYWwgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYoaXNGdW5jdGlvbikge1xuICAgICAgcG9zdENvbnN0dWN0U2V0dGVyc1tuYW1lXSA9IHZhbHVlLmJvZHkuYm9keTtcbiAgICAgIHZhciByZXN1bHQgPSB0LmNsYXNzUHJvcGVydHkodC5pZGVudGlmaWVyKG5hbWUpLCB1bmRlZmluZWQsIHR5cGUsIGRlY29yYXRvcnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVzdWx0ID0gdC5jbGFzc1Byb3BlcnR5KHQuaWRlbnRpZmllcihuYW1lKSwgdmFsdWUsIHR5cGUsIGRlY29yYXRvcnMpO1xuICAgIH1cblxuICAgIHJlc3VsdC5sZWFkaW5nQ29tbWVudHMgPSBwcm9wZXJ0eS5sZWFkaW5nQ29tbWVudHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHZhciBwb2x5bWVyUGF0aHNCeUZpbGVOYW1lID0ge1xuICAgICdpcm9uLWJ1dHRvbi1zdGF0ZSc6ICdpcm9uLWJlaGF2aW9ycycsXG4gICAgJ2lyb24tY29udHJvbC1zdGF0ZSc6ICdpcm9uLWJlaGF2aW9ycycsXG4gICAgJ2lyb24tbWVudS1iZWhhdmlvcic6ICdpcm9uLW1lbnUtYmVoYXZpb3InLFxuICAgICdpcm9uLW1lbnViYXItYmVoYXZpb3InOiAnaXJvbi1tZW51LWJlaGF2aW9yJyxcbiAgICAnaXJvbi1tdWx0aS1zZWxlY3RhYmxlLWJlaGF2aW9yJzogJ2lyb24tc2VsZWN0b3InLFxuICAgICdpcm9uLXNlbGVjdGFibGUnOiAnaXJvbi1zZWxlY3RvcicsXG4gICAgJ2lyb24tc2VsZWN0aW9uJzogJ2lyb24tc2VsZWN0b3InLFxuICAgICdwYXBlci1idXR0b24tYmVoYXZpb3InOiAncGFwZXItYmVoYXZpb3JzJyxcbiAgICAncGFwZXItY2hlY2tlZC1lbGVtZW50LWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ3BhcGVyLWlua3ktZm9jdXMtYmVoYXZpb3InOiAncGFwZXItYmVoYXZpb3JzJyxcbiAgICAncGFwZXItcmlwcGxlLWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ25lb24tYW5pbWF0YWJsZS1iZWhhdmlvcic6ICduZW9uLWFuaW1hdGlvbicsXG4gICAgJ25lb24tc2hhcmVkLWVsZW1lbnQtYW5pbWF0aW9uLWJlaGF2aW9yJzogJ25lb24tYW5pbWF0aW9uJ1xuICB9O1xuICBmdW5jdGlvbiBnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lKGZpbGVQYXRoOiBzdHJpbmcsIGR0c0ZpbGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGR0c0ZpbGVOYW1lID0gZHRzRmlsZU5hbWUucmVwbGFjZSgvLWltcGwkLywgJycpO1xuICAgIHZhciBwYXRoID0gcG9seW1lclBhdGhzQnlGaWxlTmFtZVtkdHNGaWxlTmFtZV07XG5cbiAgICBpZighcGF0aCkge1xuICAgICAgaWYodmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCArIGR0c0ZpbGVOYW1lICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmh0bWwnKSkge1xuICAgICAgICByZXR1cm4gZHRzRmlsZU5hbWU7XG4gICAgICB9XG4gICAgICBwYXRoID0gZHRzRmlsZU5hbWUubWF0Y2goL1teLV0rLVteLV0rLylbMF07XG4gICAgICBpZih2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoICsgcGF0aCArICcvJyArIGR0c0ZpbGVOYW1lICsgJy5odG1sJykpIHtcbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgICB9XG5cbiAgICAgIGxldCBiZWhhdmlvciA9IGR0c0ZpbGVOYW1lLmluZGV4T2YoJy1iZWhhdmlvcicpO1xuICAgICAgaWYgKGJlaGF2aW9yID4gMCApIHtcbiAgICAgICAgcmV0dXJuIGdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUoZmlsZVBhdGgsIGR0c0ZpbGVOYW1lLnN1YnN0cmluZygwLCBiZWhhdmlvcikpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc29sZS5pbmZvKCchISEhISEhISEhISEhISEhISEhISEhISEhIGZhaWxlZCB0byBmaW5kIHBhdGggZm9yJywgZHRzRmlsZU5hbWUpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBwYXRoO1xuICB9XG5cbiAgZnVuY3Rpb24gdmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICBpZihmcy5hY2Nlc3NTeW5jKSB7XG4gICAgICAgIGZzLmFjY2Vzc1N5bmMoZmlsZVBhdGgsIGZzLkZfT0spO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnMubHN0YXRTeW5jKGZpbGVQYXRoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZGRUeXBlRGVmaW5pdGlvblJlZmVyZW5jZShwYXRoLCBzdGF0ZSwgZHRzRmlsZU5hbWU/OiBzdHJpbmcpIHtcbiAgICAvLyBza2lwIHRlbXBsYXRpemVyIGJlaGF2aW9yLCB1c2VkIGJ5IGlyb24tbGlzdFxuICAgIGlmIChkdHNGaWxlTmFtZSAmJiBkdHNGaWxlTmFtZS5pbmRleE9mKCctJykgPCAwKSB7IHJldHVybjsgfVxuXG4gICAgLy8gRmluZCB0aGUgZmlsZSdzIHJlbGF0aXZlIHBhdGggdG8gYm93ZXJfY29tcG9uZW50c1xuICAgIHZhciBmaWxlUGF0aCA9IHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSwgZG90cyA9ICcnO1xuICAgIHdoaWxlKGZpbGVQYXRoKSB7XG4gICAgICBmaWxlUGF0aCA9IGZpbGVQYXRoLm1hdGNoKC8oLiopXFwvLiovKTtcbiAgICAgIGZpbGVQYXRoID0gZmlsZVBhdGggJiYgZmlsZVBhdGhbMV07XG4gICAgICBpZihmaWxlUGF0aCkge1xuICAgICAgICBpZih2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoICsgJy9ib3dlcl9jb21wb25lbnRzJykpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkb3RzICs9ICcuLi8nO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gV3JpdGUgb3V0IHRoZSBUeXBlU2NyaXB0IGNvZGVcbiAgICBpZihkdHNGaWxlTmFtZSkge1xuICAgICAgbGV0IGR0c1BhdGggPSBnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lKGZpbGVQYXRoICsgJy9ib3dlcl9jb21wb25lbnRzLycsIGR0c0ZpbGVOYW1lKTtcbiAgICAgIHN0YXRlLmZpbGUucGF0aC5hZGRDb21tZW50KCdsZWFkaW5nJywgJy8gPHJlZmVyZW5jZSBwYXRoPVwiJyArIGRvdHMgKyAndHlwaW5ncy8nICsgZHRzUGF0aCArICcvJyArIGR0c0ZpbGVOYW1lICsgJy5kLnRzXCIvPicsIHRydWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdGF0ZS5maWxlLnBhdGguYWRkQ29tbWVudCgnbGVhZGluZycsICcvIDxyZWZlcmVuY2UgcGF0aD1cIicgKyBkb3RzICsgJ2Jvd2VyX2NvbXBvbmVudHMvcG9seW1lci10cy9wb2x5bWVyLXRzLmQudHNcIi8+JywgdHJ1ZSk7XG4gICAgfVxuICB9XG5cbi8qXG5UT0RPOiBcbi0gbmVlZCB0byBleHBvcnQgYmVoYXZpb3IgY2xhc3Nlc1xuLSAvLy8gPHJlZmVyZW5jZSBwYXRoPVwiLi4vLi4vYm93ZXJfY29tcG9uZW50cy8uLi4uLlxuKi9cbiAgLyoqXG4gICAgVGhlIGltcGxlbWVudGF0aW9uIG9mIHRoaXMgcHJvYmFibHkgaXNuJ3Qgc3BvdCBvbiwgZm9yIG5vdyBJIGp1c3Qgd2FudCB0byBleHRyYWN0IGVub3VnaCB0byBnZW5lcmF0ZSAuZC50cyBmaWxlc1xuICAgIGZvciB0aGUgUG9seW1lciBNYXRlcmlhbCBjb21wb25lbnRzLlxuICAgICovXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lckJlaGF2aW9yRGVmaW5pdGlvbihhcnJheUV4cHJlc3Npb24sIHBhdGgsIHN0YXRlLCBtZW1iZXJFeHByZXNzaW9uKSB7XG4gICAgbGV0IGNsYXNzRGVjbGFyYXRpb24gPSB0LmNsYXNzRGVjbGFyYXRpb24odC5pZGVudGlmaWVyKG1lbWJlckV4cHJlc3Npb24ucHJvcGVydHkubmFtZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmNsYXNzQm9keShbXSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW10pO1xuICAgIGNsYXNzRGVjbGFyYXRpb24uaW1wbGVtZW50cyA9IGFycmF5RXhwcmVzc2lvbi5lbGVtZW50cy5tYXAoIChiZWhhdmlvcikgPT4ge1xuICAgICAgaWYoYmVoYXZpb3IucHJvcGVydHkubmFtZSAhPSBtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUgKyAnSW1wbCcpIHtcbiAgICAgICAgYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUsIHRvRGFzaENhc2UoYmVoYXZpb3IucHJvcGVydHkubmFtZSkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHQuY2xhc3NJbXBsZW1lbnRzKGJlaGF2aW9yLnByb3BlcnR5KTtcbiAgICB9KTtcbiAgICAvL2NsYXNzRGVjbGFyYXRpb24ubW9kaWZpZXJzID0gW3QuYWJzcmFjdF1cbiAgICBcbiAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGgodC5kZWNsYXJlTW9kdWxlKHQuaWRlbnRpZmllcihtZW1iZXJFeHByZXNzaW9uLm9iamVjdC5uYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYmxvY2tTdGF0ZW1lbnQoW2NsYXNzRGVjbGFyYXRpb25dKSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQ2xhc3Mob2JqZWN0RXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIG1lbWJlckV4cHJlc3Npb24/LCBpc0ludGVyZmFjZSA9IGZhbHNlKSB7XG4gICAgbGV0IGNsYXNzTmFtZSwgZWxlbWVudE5hbWUsXG4gICAgICAgICAgICAgICAgZXh0ZW5kLCBiZWhhdmlvcnMsIGhvc3RBdHRyaWJ1dGVzLFxuICAgICAgICAgICAgICAgIHByb3BlcnRpZXMgLyo6IEFycmF5PENsYXNzUHJvcGVydHk+ICovID0gW10sXG4gICAgICAgICAgICAgICAgY29uc3RydWN0b3IsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb25zIC8qOiBBcnJheTxDbGFzc01ldGhvZD4qLyA9IFtdO1xuXG4gICAgb2JqZWN0RXhwcmVzc2lvbi5wcm9wZXJ0aWVzLmZvckVhY2goIChjb25maWcpID0+IHtcbiAgICAgIHN3aXRjaChjb25maWcua2V5Lm5hbWUpIHtcbiAgICAgIGNhc2UgJ2lzJzpcbiAgICAgICAgZWxlbWVudE5hbWUgPSBjb25maWcudmFsdWUudmFsdWU7XG4gICAgICAgIGNsYXNzTmFtZSA9IHRvVXBwZXJDYW1lbChjb25maWcudmFsdWUudmFsdWUpO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1BhcnNpbmcgUG9seW1lciBlbGVtZW50JywgZWxlbWVudE5hbWUsICdpbicsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXh0ZW5kcyc6XG4gICAgICAgIGV4dGVuZCA9IGNvbmZpZy52YWx1ZS52YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdiZWhhdmlvcnMnOlxuICAgICAgICBiZWhhdmlvcnMgPSBjb25maWcudmFsdWUuZWxlbWVudHMubWFwKHBhcnNlUG9seW1lckJlaGF2aW9yUmVmZXJlbmNlLmJpbmQodW5kZWZpbmVkLCBzdGF0ZS5vcHRzLnVzZUJlaGF2aW9yRGVjb3JhdG9yKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncHJvcGVydGllcyc6XG4gICAgICAgIHByb3BlcnRpZXMgPSBjb25maWcudmFsdWUucHJvcGVydGllcy5tYXAocGFyc2VQb2x5bWVyUHJvcGVydHkpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2hvc3RBdHRyaWJ1dGVzJzpcbiAgICAgICAgaG9zdEF0dHJpYnV0ZXMgPSBjb25maWcudmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb2JzZXJ2ZXJzJzpcbiAgICAgICAgb2JzZXJ2ZXJzID0gcGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzKGNvbmZpZy52YWx1ZS5lbGVtZW50cyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbGlzdGVuZXJzJzpcbiAgICAgICAgbGlzdGVuZXJzID0gcGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMoY29uZmlnLnZhbHVlLnByb3BlcnRpZXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmKHQuaXNPYmplY3RNZXRob2QoY29uZmlnKSkge1xuICAgICAgICAgIGZ1bmN0aW9ucy5wdXNoKHQuY2xhc3NNZXRob2QoY29uZmlnLmtpbmQsIGNvbmZpZy5rZXksIGNvbmZpZy5wYXJhbXMsIGNvbmZpZy5ib2R5LCBjb25maWcuY29tcHV0ZWQsIGNvbmZpZy5zdGF0aWMpKTtcbiAgICAgICAgfSBlbHNlIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24oY29uZmlnLnZhbHVlKSkge1xuICAgICAgICAgIGxldCBtZXRob2QgPSBwYXJzZU5vblBvbHltZXJGdW5jdGlvbihjb25maWcpO1xuXG4gICAgICAgICAgaWYobWV0aG9kLmtleS5uYW1lID09ICdmYWN0b3J5SW1wbCcpIHtcbiAgICAgICAgICAgIG1ldGhvZC5rZXkubmFtZSA9IG1ldGhvZC5raW5kID0gJ2NvbnN0cnVjdG9yJztcbiAgICAgICAgICAgIGNvbnN0cnVjdG9yID0gbWV0aG9kO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBBZGQgb2JzZXJ2ZXIgZGVjb3JhdG9yc1xuICAgICAgICAgICAgbGV0IGZ1bmN0aW9uT2JzZXJ2ZXIgPSBvYnNlcnZlcnNbbWV0aG9kLmtleS5uYW1lXTtcbiAgICAgICAgICAgIGlmKGZ1bmN0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgaWYoIW1ldGhvZC5kZWNvcmF0b3JzKSB7IG1ldGhvZC5kZWNvcmF0b3JzID0gW107IH1cbiAgICAgICAgICAgICAgICBtZXRob2QuZGVjb3JhdG9ycy5wdXNoKGZ1bmN0aW9uT2JzZXJ2ZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgbGlzdGVuZXIgZGVjb3JhdG9yc1xuICAgICAgICAgICAgbGV0IGZ1bmN0aW9uTGlzdGVuZXJzID0gbGlzdGVuZXJzW21ldGhvZC5rZXkubmFtZV07XG4gICAgICAgICAgICBpZihmdW5jdGlvbkxpc3RlbmVycykge1xuICAgICAgICAgICAgICBmdW5jdGlvbkxpc3RlbmVycy5mb3JFYWNoKCAobGlzdGVuZXIpID0+IHtcbiAgICAgICAgICAgICAgICBpZighbWV0aG9kLmRlY29yYXRvcnMpIHsgbWV0aG9kLmRlY29yYXRvcnMgPSBbXTsgfVxuICAgICAgICAgICAgICAgIG1ldGhvZC5kZWNvcmF0b3JzLnB1c2gobGlzdGVuZXIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9ucy5wdXNoKG1ldGhvZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHQuaXNPYmplY3RFeHByZXNzaW9uKSB7XG4gICAgICAgICAgcHJvcGVydGllcy5wdXNoKHQuY2xhc3NQcm9wZXJ0eSh0LmlkZW50aWZpZXIoY29uZmlnLmtleS5uYW1lKSwgY29uZmlnLnZhbHVlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFwiISEhISEhISEhISEgVW5leHBlY3RlZCBwcm9wZXJ0eTpcIiwgY29uZmlnLmtleSArICc6JywgY29uZmlnLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgbGV0IGRlY29yYXRvcnMgPSBbXTtcbiAgICBpZihlbGVtZW50TmFtZSkge1xuICAgICAgZGVjb3JhdG9ycy5wdXNoKGNyZWF0ZURlY29yYXRvcignY29tcG9uZW50JywgZWxlbWVudE5hbWUpKTtcbiAgICAgIGlmKGV4dGVuZCkge1xuICAgICAgICBkZWNvcmF0b3JzLnB1c2goY3JlYXRlRGVjb3JhdG9yKCdleHRlbmQnLCBleHRlbmQpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYoaG9zdEF0dHJpYnV0ZXMpIHtcbiAgICAgIGRlY29yYXRvcnMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2hvc3RBdHRyaWJ1dGVzJywgaG9zdEF0dHJpYnV0ZXMpKTtcbiAgICB9XG4gICAgaWYoYmVoYXZpb3JzICYmIHN0YXRlLm9wdHMudXNlQmVoYXZpb3JEZWNvcmF0b3IpIHtcbiAgICAgIGRlY29yYXRvcnMgPSBkZWNvcmF0b3JzLmNvbmNhdChiZWhhdmlvcnMpO1xuICAgIH1cblxuICAgIC8vIEFkZCBhbnkgcG9zdENvbnN0cnVjdG9yU2V0dGVycyAoUG9seW1lciBwcm9wZXJ0aWVzIHdpdGggYSBmdW5jdGlvbiBmb3IgYHZhbHVlYClcbiAgICBsZXQgY29uc3R1Y3RvckJvZHkgLyo6IEFycmF5PFN0YXRlbWVudD4qLyA9IGNvbnN0cnVjdG9yID8gY29uc3RydWN0b3IuYm9keS5ib2R5IDogW107XG5cbiAgICBmb3IodmFyIGtleSBpbiBwb3N0Q29uc3R1Y3RTZXR0ZXJzKSB7XG4gICAgICBsZXQgcG9zdENvbnN0dWN0U2V0dGVyIC8qOiBCbG9ja1N0YXRlbWVudCB8IEV4cHJlc3Npb24gKi8gPSBwb3N0Q29uc3R1Y3RTZXR0ZXJzW2tleV07XG4gICAgICBjb25zdHVjdG9yQm9keS5wdXNoKHQuZXhwcmVzc2lvblN0YXRlbWVudChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LkFzc2lnbm1lbnRFeHByZXNzaW9uKCc9JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbih0LnRoaXNFeHByZXNzaW9uKCksIHQuaWRlbnRpZmllcihrZXkpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2FsbEV4cHJlc3Npb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYXJyb3dGdW5jdGlvbkV4cHJlc3Npb24oW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5ibG9ja1N0YXRlbWVudChwb3N0Q29uc3R1Y3RTZXR0ZXIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICApKTtcbiAgICB9XG4gICAgaWYoY29uc3R1Y3RvckJvZHkubGVuZ3RoKSB7XG4gICAgICBwcm9wZXJ0aWVzLnB1c2goY29uc3RydWN0b3IgfHwgdC5jbGFzc01ldGhvZCgnY29uc3RydWN0b3InLCB0LmlkZW50aWZpZXIoJ2NvbnN0cnVjdG9yJyksIFtdLCB0LmJsb2NrU3RhdGVtZW50KGNvbnN0dWN0b3JCb2R5KSkpO1xuICAgIH1cblxuICAgIGFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlKHBhdGgsIHN0YXRlKTtcbiAgICBpZihiZWhhdmlvcnMpIHtcbiAgICAgIGJlaGF2aW9ycy5mb3JFYWNoKCAoYmVoYXZpb3IpID0+IHtcbiAgICAgICAgYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUsIHRvRGFzaENhc2UoYmVoYXZpb3IucHJvcGVydHkubmFtZSkpO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgaWYobWVtYmVyRXhwcmVzc2lvbikge1xuICAgICAgY2xhc3NOYW1lID0gbWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lO1xuICAgIH1cblxuICAgIGxldCBjbGFzc0RlY2xhcmF0aW9uO1xuICAgIGlmIChpc0ludGVyZmFjZSkge1xuICAgICAgcHJvcGVydGllcy5mb3JFYWNoKCAocHJvcCkgPT4ge1xuICAgICAgICBkZWxldGUgcHJvcC5kZWNvcmF0b3JzO1xuICAgICAgICBkZWxldGUgcHJvcC52YWx1ZTtcbiAgICAgIH0pO1xuICAgICAgZnVuY3Rpb25zLmZvckVhY2goIChwcm9wKSA9PiB7XG4gICAgICAgIGRlbGV0ZSBwcm9wLmRlY29yYXRvcnM7XG4gICAgICAgIGRlbGV0ZSBwcm9wLmJvZHk7XG4gICAgICB9KTtcbiAgICAgIGNsYXNzRGVjbGFyYXRpb24gPSB0LmludGVyZmFjZURlY2xhcmF0aW9uKHQuaWRlbnRpZmllcihjbGFzc05hbWUpLCBudWxsIC8qdHlwZVBhcmFtZXRlcnMqLyxcbiAgICAgICAgICBbXSwgdC5jbGFzc0JvZHkocHJvcGVydGllcy5jb25jYXQoZnVuY3Rpb25zKSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjbGFzc0RlY2xhcmF0aW9uID0gdC5jbGFzc0RlY2xhcmF0aW9uKHQuaWRlbnRpZmllcihjbGFzc05hbWUpLFxuICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbih0LmlkZW50aWZpZXIoJ3BvbHltZXInKSwgdC5pZGVudGlmaWVyKCdCYXNlJykpLFxuICAgICAgICAgIHQuY2xhc3NCb2R5KHByb3BlcnRpZXMuY29uY2F0KGZ1bmN0aW9ucykpLFxuICAgICAgICAgIGRlY29yYXRvcnMpO1xuICAgIH1cblxuICAgIGlmKGJlaGF2aW9ycyAmJiAhc3RhdGUub3B0cy51c2VCZWhhdmlvckRlY29yYXRvcikge1xuICAgICAgY2xhc3NEZWNsYXJhdGlvbi5pbXBsZW1lbnRzID0gYmVoYXZpb3JzLm1hcCggKGJlaGF2aW9yKSA9PiB7XG4gICAgICAgIHJldHVybiB0LmNsYXNzSW1wbGVtZW50cyhiZWhhdmlvcik7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZihtZW1iZXJFeHByZXNzaW9uKSB7XG4vL1RPRE86IGV4cG9ydCBjbGFzcywgbW9kdWxlIG9uIHNhbWUgbGluZSBhcyBQb2x5bWVyXG4vLyAgICAgIGxldCBtb2R1bGUgPSB0LmRlY2xhcmVNb2R1bGUodC5pZGVudGlmaWVyKG1lbWJlckV4cHJlc3Npb24ub2JqZWN0Lm5hbWUpLFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYmxvY2tTdGF0ZW1lbnQoW2NsYXNzRGVjbGFyYXRpb25dKSk7XG4gICAgICBsZXQgbW9kdWxlID0gdC5ibG9ja1N0YXRlbWVudChbY2xhc3NEZWNsYXJhdGlvbl0pO1xuXG4gICAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGhNdWx0aXBsZShbdC5pZGVudGlmaWVyKCdtb2R1bGUnKSwgdC5pZGVudGlmaWVyKCdQb2x5bWVyJyksIG1vZHVsZV0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGgoY2xhc3NEZWNsYXJhdGlvbik7XG5cbiAgICAgIHBhdGgucGFyZW50UGF0aC5pbnNlcnRBZnRlcih0LmV4cHJlc3Npb25TdGF0ZW1lbnQoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmNhbGxFeHByZXNzaW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0Lm1lbWJlckV4cHJlc3Npb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5pZGVudGlmaWVyKGNsYXNzTmFtZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5pZGVudGlmaWVyKCdyZWdpc3RlcicpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uKGZ1bmN0aW9uRXhwcmVzc2lvbikge1xuICAgIHZhciBuYW1lZFN0YXRlbWVudHMgPSB7fSxcbiAgICAgIHJlc3VsdDtcblxuICAgIGZ1bmN0aW9uRXhwcmVzc2lvbi5ib2R5LmJvZHkuZm9yRWFjaCggKHN0YXRlbWVudCkgPT4ge1xuICAgICAgaWYgKHQuaXNSZXR1cm5TdGF0ZW1lbnQoc3RhdGVtZW50KSkge1xuICAgICAgICByZXN1bHQgPSBzdGF0ZW1lbnQuYXJndW1lbnQ7ICAgICAgICBcbiAgICAgIH0gZWxzZSBpZiAodC5pc0Z1bmN0aW9uRGVjbGFyYXRpb24oc3RhdGVtZW50KSkge1xuICAgICAgICBuYW1lZFN0YXRlbWVudHNbc3RhdGVtZW50LmlkLm5hbWVdID0gdC5mdW5jdGlvbkV4cHJlc3Npb24obnVsbCwgc3RhdGVtZW50LnBhcmFtcywgc3RhdGVtZW50LmJvZHkpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmVzdWx0LnByb3BlcnRpZXMuZm9yRWFjaCggKHByb3BlcnR5KSA9PiB7XG4gICAgICBpZiAodC5pc0lkZW50aWZpZXIocHJvcGVydHkudmFsdWUpKSB7XG4gICAgICAgIGxldCBzdGF0ZW1lbnQgPSBuYW1lZFN0YXRlbWVudHNbcHJvcGVydHkudmFsdWUubmFtZV07XG4gICAgICAgIGlmIChzdGF0ZW1lbnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHByb3BlcnR5LnZhbHVlID0gc3RhdGVtZW50O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICB2aXNpdG9yOiB7XG4gICAgICBDYWxsRXhwcmVzc2lvbihwYXRoLCBzdGF0ZSkge1xuICAgICAgICBvYnNlcnZlcnMgPSB7fTtcbiAgICAgICAgbGlzdGVuZXJzID0ge307XG4gICAgICAgIHBvc3RDb25zdHVjdFNldHRlcnMgPSB7fTtcblxuICAgICAgICAvLyBGb3Igc29tZSByZWFzb24gd2UgdmlzaXQgZWFjaCBpZGVudGlmaWVyIHR3aWNlXG4gICAgICAgIGlmKHBhdGgubm9kZS5jYWxsZWUuc3RhcnQgIT0gc3RhcnQpIHtcbiAgICAgICAgICBzdGFydCA9IHBhdGgubm9kZS5jYWxsZWUuc3RhcnQ7XG5cbiAgICAgICAgICBpZiAoIXBhdGgubm9kZS5jYWxsZWUubmFtZSAmJiB0LmlzRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5jYWxsZWUpKSB7XG4gICAgICAgICAgICAvLyBhbm9ueW1vdXMgZnVuY3Rpb24gLSB3b24ndCBiZSBhYmxlIHRvIGdlbmVyYXRlIC5kLnRzXG4gICAgICAgICAgICB2YXIgYm9keU5vZGVzID0gcGF0aC5ub2RlLmNhbGxlZS5ib2R5LmJvZHk7XG4gICAgICAgICAgICBwYXRoLnJlcGxhY2VXaXRoKGJvZHlOb2Rlc1swXSk7XG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMTsgaSA8IGJvZHlOb2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICBwYXRoLnBhcmVudFBhdGguaW5zZXJ0QWZ0ZXIoYm9keU5vZGVzW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2UgaWYgKHBhdGgubm9kZS5jYWxsZWUubmFtZSA9PSAnUG9seW1lcicpIHtcbiAgICAgICAgICAgIGxldCBtZW1iZXJFeHByZXNzaW9uID0gdC5pc0Fzc2lnbm1lbnRFeHByZXNzaW9uKHBhdGgucGFyZW50KSAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5pc01lbWJlckV4cHJlc3Npb24ocGF0aC5wYXJlbnQubGVmdCkgP1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcGF0aC5wYXJlbnQubGVmdCA6IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAvL21vZHVsZSA9IHBhdGgucGFyZW50LmxlZnQub2JqZWN0Lm5hbWU7XG4gICAgICAgICAgICAgICAgLy8gcGF0aC5wYXJlbnQubGVmdC5wcm9wZXJ0eS5uYW1lXG5cbiAgICAgICAgICAgIHBhcnNlUG9seW1lckNsYXNzKHBhdGgubm9kZS5hcmd1bWVudHNbMF0sIHBhdGgsIHN0YXRlLCBtZW1iZXJFeHByZXNzaW9uLCBmYWxzZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBBc3NpZ25tZW50RXhwcmVzc2lvbihwYXRoLCBzdGF0ZSkge1xuICAgICAgICBpZih0LmlzTWVtYmVyRXhwcmVzc2lvbihwYXRoLm5vZGUubGVmdCkpIHtcbiAgICAgICAgICBpZihwYXRoLm5vZGUubGVmdC5vYmplY3QubmFtZSA9PSAnUG9seW1lcicpIHtcbiAgICAgICAgICAgIGxldCBjbGFzc05hbWUgPSBwYXRoLm5vZGUubGVmdC5vYmplY3QubmFtZSArICcuJyArIHBhdGgubm9kZS5sZWZ0LnByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1BhcnNpbmcgUG9seW1lciBiZWhhdmlvcicsIGNsYXNzTmFtZSwgJ2luJywgc3RhdGUuZmlsZS5vcHRzLmZpbGVuYW1lKTtcbiAgICAgICAgICAgIGlmKHQuaXNDYWxsRXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG5jb25zb2xlLmluZm8oJy4uLi4uLi4uLi4gQ2FsbCB3aXRoaW4gYXNzaWdubWVudCcsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4gICAgICAgICAgICAgIC8vaWYocGF0aC5ub2RlLnJpZ2h0LmNhbGxlZS5uYW1lID09ICdQb2x5bWVyJykge1xuICAgICAgICAgICAgICAvLyAgcGFyc2VQb2x5bWVyQ2xhc3MocGF0aC5ub2RlLnJpZ2h0LmFyZ3VtZW50c1swXSwgcGF0aCwgc3RhdGUpOyAvLywgcGF0aC5ub2RlLmxlZnQpO1xuICAgICAgICAgICAgICAvL30gZWxzZSBpZih0LmlzRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpKSB7XG4gICAgICAgICAgICAgIC8vICBsZXQgZXhwcmVzc2lvbiA9IGV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpO1xuICAgICAgICAgICAgICAvLyAgcGFyc2VQb2x5bWVyQ2xhc3MoZXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIHBhdGgubm9kZS5sZWZ0KTtcbiAgICAgICAgICAgICAgLy99XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc09iamVjdEV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0KSkge1xuICAgICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCwgdHJ1ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc0FycmF5RXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG4gICAgICAgICAgICAgIHBhcnNlUG9seW1lckJlaGF2aW9yRGVmaW5pdGlvbihwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGxvZ1BhdGgocGF0aCkge1xuICBmb3IodmFyIHByb3BOYW1lIGluIHBhdGgpIHtcbiAgICBpZihwYXRoLmhhc093blByb3BlcnR5KHByb3BOYW1lKVxuICAgICAgJiYgcHJvcE5hbWUgIT0gJ3BhcmVudFBhdGgnICYmIHByb3BOYW1lICE9ICdwYXJlbnQnXG4gICAgICAmJiBwcm9wTmFtZSAhPSAnaHViJ1xuICAgICAgJiYgcHJvcE5hbWUgIT0gJ2NvbnRhaW5lcicpIHtcbiAgICAgIGNvbnNvbGUubG9nKHByb3BOYW1lLCBwYXRoW3Byb3BOYW1lXSk7XG4gICAgfVxuICB9XG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
