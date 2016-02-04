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
    function createTypeAnnotation(type, elementType) {
        if (elementType === void 0) { elementType = 'any'; }
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
                //console.info('TTTTTTTTTTTTTTTTTTTTTTTTTTTTt type:', type);    
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
    function parseNonPolymerFunction(node) {
        var name = node.key.name, params = node.value.params, body /*: Array<Statement */ = node.value.body.body;
        var method = t.classMethod('method', t.identifier(name), params, t.blockStatement(body));
        // Attempt to guess the types from parameter names
        if (node.value.params) {
            node.value.params.forEach(function (param) {
                var type = null;
                param.optional = !!param.name.match(/^opt/);
                switch (param.name) {
                    case 'el':
                        type = 'HTMLElement';
                        break;
                    case 'event':
                        type = 'Event';
                        break;
                    default:
                        if (name.match(/Element$/)) {
                            type = 'HTMLElement';
                        }
                }
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
                        node.value.params[i].optional = true;
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
                    if (node.value.params[i].name == param) {
                        node.value.params[i].typeAnnotation = createTypeAnnotation(type);
                    }
                    else {
                        console.warn('param', i, '(' + node.value.params[i] + ') !=', param);
                    }
                }
            }
            method.leadingComments = node.leadingComments;
        }
        return method;
    }
    function parsePolymerProperty(property) {
        //console.info('############# parsePolymerProperty:', property)    ;
        var name = property.key.name, attributes = property.value.properties, type, value, isFunction, params, readonly = false, decoratorProps = [];
        if (t.isIdentifier(property.value)) {
            type = createTypeAnnotation(property.value.name);
        }
        else {
            attributes.forEach(function (attribute) {
                //console.info('   &&&&&&&&&&&&&&&& attribute:', attribute)        ;
                var attr_name = attribute.key.name;
                switch (attr_name) {
                    case 'type':
                        // one of Boolean, Date, Number, String, Array or Object
                        type = createTypeAnnotation(attribute.value.name);
                        ///console.info('->>>>>>>>>>>>> inferred type:', type);          
                        decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.name));
                        break;
                    case 'value':
                        // Default value for the property
                        value = attribute.value;
                        //console.info('->>>>>>>>>>>>>>>> inferred value:', value);          
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
                        // computed function call (as string)
                        // console.info('===========', attribute.value)          ;
                        decoratorProps.push(createDecoratorProperty(attr_name, '\'' + attribute.value.value + '\''));
                        break;
                    default:
                        console.warn('Unexpected property attribute: ', attribute.key.name, 'at line', attribute.loc.start.line);
                        decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.value));
                }
            });
        }
        var decorators = [t.decorator(t.callExpression(t.identifier('property'), [t.objectExpression(decoratorProps)]))];
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
        //console.info('....................looking for ' + dtsFileName, 'in', filePath);
        if (!path) {
            //console.info('11111111111111111111 ', filePath + '...' + dtsFileName + '/' + dtsFileName + '.html');      
            if (verifyPathExists(filePath + dtsFileName + '/' + dtsFileName + '.html')) {
                return dtsFileName;
            }
            path = dtsFileName.match(/[^-]+-[^-]+/)[0];
            //console.info('22222222222222222222 ', filePath + '...' + path + '/' + dtsFileName + '.html');      
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
        //console.info('-----------', arrayExpression)      ;
        classDeclaration.implements = arrayExpression.elements.map(function (behavior) {
            //console.info('-----------', behavior.property.name, memberExpression.property.name)      ;
            if (behavior.property.name != memberExpression.property.name + 'Impl') {
                addTypeDefinitionReference(path, state, toDashCase(behavior.property.name));
            }
            return t.classImplements(behavior.property);
        });
        //classDeclaration.modifiers = [t.absract]
        path.parentPath.replaceWith(t.declareModule(t.identifier(memberExpression.object.name), t.blockStatement([classDeclaration])));
    }
    function parsePolymerClass(objectExpression, path, state, memberExpression) {
        //console.info('===========================objectExpression:', objectExpression);    
        //console.info('---------------------------memberExpression:', memberExpression);
        var className, elementName, extend, behaviors, hostAttributes, properties /*: Array<ClassProperty> */ = [], constructor, functions /*: Array<ClassMethod>*/ = [];
        objectExpression.properties.forEach(function (config) {
            // console.info('------------------', config);
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
        //console.info('-------------', functionExpression);
        functionExpression.body.body.forEach(function (statement) {
            //console.info('   ...', statement)      ;
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
                // console.info('0000000000000  ', path.node.callee.name);
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
                //console.info('sadfffffffffffffffffffffffffff');
                if (t.isMemberExpression(path.node.left)) {
                    //console.info('1............. path.node:', path.node);
                    if (path.node.left.object.name == 'Polymer') {
                        var className = path.node.left.object.name + '.' + path.node.left.property.name;
                        console.info('Parsing Polymer behavior', className, 'in', state.file.opts.filename);
                        //console.info('2..................................', path.node.left);
                        //console.info('3.............', path.node.right.type);
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbInRvRGFzaENhc2UiLCJ0b1VwcGVyQ2FtZWwiLCJjcmVhdGVEZWNvcmF0b3IiLCJjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eSIsImNyZWF0ZVR5cGVBbm5vdGF0aW9uIiwicGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzIiwicGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMiLCJwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSIsInBhcnNlTm9uUG9seW1lckZ1bmN0aW9uIiwicGFyc2VQb2x5bWVyUHJvcGVydHkiLCJnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lIiwidmVyaWZ5UGF0aEV4aXN0cyIsImFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlIiwicGFyc2VQb2x5bWVyQmVoYXZpb3JEZWZpbml0aW9uIiwicGFyc2VQb2x5bWVyQ2xhc3MiLCJldmFsdWF0ZUZ1bmN0aW9uRXhwcmVzc2lvbiIsIkNhbGxFeHByZXNzaW9uIiwiQXNzaWdubWVudEV4cHJlc3Npb24iLCJsb2dQYXRoIl0sIm1hcHBpbmdzIjoiQUFBQSxrQ0FBa0M7QUFFbEMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7QUFFeEMsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFFMUIsbUJBQXdCLEVBQVk7UUFBSCxDQUFDO0lBQ2pDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUNULFNBQVMsR0FBRyxFQUFFLEVBQ2QsU0FBUyxHQUFHLEVBQUUsRUFDZCxtQkFBbUIsR0FBRyxFQUFFLENBQUM7SUFFN0Isb0JBQW9CLEdBQVc7UUFDN0JBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsRUFBRUEsVUFBU0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBRSxNQUFNLENBQUMsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMs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S0FBS0EsQ0FBQ0EsQ0FBQ0E7UUFFeENBLEVBQUVBLENBQUFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDcEJBLFNBQVNBLEdBQUdBLGdCQUFnQkEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7UUFDN0NBLENBQUNBO1FBRURBLElBQUlBLGdCQUFnQkEsR0FBR0EsQ0FBQ0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUN2QkEsQ0FBQ0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxTQUFTQSxDQUFDQSxFQUFFQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxNQUFNQSxDQUFDQSxDQUFDQSxFQUNqRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsRUFDekNBLFVBQVVBLENBQUNBLENBQUNBO1FBRXREQSxFQUFFQSxDQUFBQSxDQUFDQSxTQUFTQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxvQkFBb0JBLENBQUNBLENBQUNBLENBQUNBO1lBQ2pEQSxnQkFBZ0JBLENBQUNBLFVBQVVBLEdBQUdBLFNBQVNBLENBQUNBLEdBQUdBLENBQUVBLFVBQUNBLFFBQVFBO2dCQUNwREEsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsZUFBZUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0E7WUFDckNBLENBQUNBLENBQUNBLENBQUNBO1FBQ0xBLENBQUNBO1FBRURBLEVBQUVBLENBQUFBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDMUJBLG9EQUFvREE7WUFDcERBLGdGQUFnRkE7WUFDaEZBLDBGQUEwRkE7WUFDcEZBLElBQUlBLFFBQU1BLEdBQUdBLENBQUNBLENBQUNBLGNBQWNBLENBQUNBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFFbERBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLG1CQUFtQkEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsVUFBVUEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsRUFBRUEsUUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDakdBLENBQUNBO1FBQUNBLElBQUlBLENBQUNBLENBQUNBO1lBQ05BLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFdBQVdBLENBQUNBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7WUFFOUNBLElBQUlBLENBQUNBLFVBQVVBLENBQUNBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBLG1CQUFtQkEsQ0FDbkJBLENBQUNBLENBQUNBLGNBQWNBLENBQ2RBLENBQUNBLENBQUNBLGdCQUFnQkEsQ0FDaEJBLENBQUNBLENBQUNBLFVBQVVBLENBQUNBLFNBQVNBLENBQUNBLEVBQ3ZCQSxDQUFDQSxDQUFDQSxVQUFVQSxDQUFDQSxVQUFVQSxDQUFDQSxDQUN6QkEsRUFDREEsRUFBRUEsQ0FDSEEsQ0FDSkEsQ0FBQ0EsQ0FBQ0E7UUFDL0JBLENBQUNBO0lBQ0hBLENBQUNBO0lBRUQsb0NBQW9DLGtCQUFrQjtRQUNwREMsSUFBSUEsZUFBZUEsR0FBR0EsRUFBRUEsRUFDdEJBLE1BQU1BLENBQUNBO1FBQ2JBLG9EQUFvREE7UUFFaERBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsT0FBT0EsQ0FBRUEsVUFBQ0EsU0FBU0E7WUFDcERBLDBDQUEwQ0E7WUFDcENBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLENBQUNBLGlCQUFpQkEsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0JBQ25DQSxNQUFNQSxHQUFHQSxTQUFTQSxDQUFDQSxRQUFRQSxDQUFDQTtZQUM5QkEsQ0FBQ0E7WUFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EscUJBQXFCQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDOUNBLGVBQWVBLENBQUNBLFNBQVNBLENBQUNBLEVBQUVBLENBQUNBLElBQUlBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLGtCQUFrQkEsQ0FBQ0EsSUFBSUEsRUFBRUEsU0FBU0EsQ0FBQ0EsTUFBTUEsRUFBRUEsU0FBU0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7WUFDcEdBLENBQUNBO1FBQ0hBLENBQUNBLENBQUNBLENBQUNBO1FBRUhBLE1BQU1BLENBQUNBLFVBQVVBLENBQUNBLE9BQU9BLENBQUVBLFVBQUNBLFFBQVFBO1lBQ2xDQSxFQUFFQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxZQUFZQSxDQUFDQSxRQUFRQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTtnQkFDbkNBLElBQUlBLFNBQVNBLEdBQUdBLGVBQWVBLENBQUNBLFFBQVFBLENBQUNBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLENBQUNBO2dCQUNyREEsRUFBRUEsQ0FBQ0EsQ0FBQ0EsU0FBU0EsS0FBS0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQzVCQSxRQUFRQSxDQUFDQSxLQUFLQSxHQUFHQSxTQUFTQSxDQUFDQTtnQkFDN0JBLENBQUNBO1lBQ0hBLENBQUNBO1FBQ0hBLENBQUNBLENBQUNBLENBQUNBO1FBRUhBLE1BQU1BLENBQUNBLE1BQU1BLENBQUNBO0lBQ2hCQSxDQUFDQTtJQUVELE1BQU0sQ0FBQztRQUNMLE9BQU8sRUFBRTtZQUNQLGNBQWMsWUFBQyxJQUFJLEVBQUUsS0FBSztnQkFDeEJDLFNBQVNBLEdBQUdBLEVBQUVBLENBQUNBO2dCQUNmQSxTQUFTQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFDZkEsbUJBQW1CQSxHQUFHQSxFQUFFQSxDQUFDQTtnQkFFakNBLDBEQUEwREE7Z0JBQ2xEQSxpREFBaURBO2dCQUNqREEsRUFBRUEsQ0FBQUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsS0FBS0EsSUFBSUEsS0FBS0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7b0JBQ25DQSxLQUFLQSxHQUFHQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxLQUFLQSxDQUFDQTtvQkFFL0JBLEVBQUVBLENBQUNBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQ3ZFQSx1REFBdURBO3dCQUN2REEsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7d0JBQzNDQSxJQUFJQSxDQUFDQSxXQUFXQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTt3QkFDL0JBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLENBQUNBLEdBQUdBLENBQUNBLEVBQUVBLENBQUNBLEdBQUdBLFNBQVNBLENBQUNBLE1BQU1BLEVBQUVBLENBQUNBLEVBQUVBLEVBQUVBLENBQUNBOzRCQUMxQ0EsSUFBSUEsQ0FBQ0EsVUFBVUEsQ0FBQ0EsV0FBV0EsQ0FBQ0EsU0FBU0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7d0JBQzVDQSxDQUFDQTtvQkFDSEEsQ0FBQ0E7b0JBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUNBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO3dCQUM5Q0EsSUFBSUEsZ0JBQWdCQSxHQUFHQSxDQUFDQSxDQUFDQSxzQkFBc0JBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBOzRCQUNwQ0EsQ0FBQ0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxNQUFNQSxDQUFDQSxJQUFJQSxDQUFDQTs0QkFDdENBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLEdBQUdBLFNBQVNBLENBQUNBO3dCQUNqREEsd0NBQXdDQTt3QkFDeENBLGlDQUFpQ0E7d0JBRXJDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLEVBQUVBLGdCQUFnQkEsQ0FBQ0EsQ0FBQ0E7b0JBQzNFQSxDQUFDQTtnQkFDSEEsQ0FBQ0E7WUFDSEEsQ0FBQ0E7WUFFRCxvQkFBb0IsWUFBQyxJQUFJLEVBQUUsS0FBSztnQkFDdENDLGlEQUFpREE7Z0JBQ3pDQSxFQUFFQSxDQUFBQSxDQUFDQSxDQUFDQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLENBQUNBLENBQUNBLENBQUNBO29CQUNsREEsdURBQXVEQTtvQkFDN0NBLEVBQUVBLENBQUFBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO3dCQUMzQ0EsSUFBSUEsU0FBU0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsTUFBTUEsQ0FBQ0EsSUFBSUEsR0FBR0EsR0FBR0EsR0FBR0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsSUFBSUEsQ0FBQ0E7d0JBQ2hGQSxPQUFPQSxDQUFDQSxJQUFJQSxDQUFDQSwwQkFBMEJBLEVBQUVBLFNBQVNBLEVBQUVBLElBQUlBLEVBQUVBLEtBQUtBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBO3dCQUNoR0Esc0VBQXNFQTt3QkFDdEVBLHVEQUF1REE7d0JBQzNDQSxFQUFFQSxDQUFBQSxDQUFDQSxDQUFDQSxDQUFDQSxnQkFBZ0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUNyREEsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsbUNBQW1DQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTt3QkFPaEVBLENBQUNBO3dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFBQSxDQUFDQSxDQUFDQSxDQUFDQSxrQkFBa0JBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUNoREEsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTt3QkFDbEVBLENBQUNBO3dCQUFDQSxJQUFJQSxDQUFDQSxFQUFFQSxDQUFBQSxDQUFDQSxDQUFDQSxDQUFDQSxpQkFBaUJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLENBQUNBLENBQUNBLENBQUNBOzRCQUMvQ0EsOEJBQThCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTt3QkFDL0VBLENBQUNBO29CQUVIQSxDQUFDQTtnQkFDSEEsQ0FBQ0E7WUFDSEEsQ0FBQ0E7U0FDRjtLQUNGLENBQUE7QUFDSCxDQUFDO0FBM2pCRDsyQkEyakJDLENBQUE7QUFFRCxpQkFBaUIsSUFBSTtJQUNuQkMsR0FBR0EsQ0FBQUEsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsSUFBSUEsSUFBSUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDekJBLEVBQUVBLENBQUFBLENBQUNBLElBQUlBLENBQUNBLGNBQWNBLENBQUNBLFFBQVFBLENBQUNBO2VBQzNCQSxRQUFRQSxJQUFJQSxZQUFZQSxJQUFJQSxRQUFRQSxJQUFJQSxRQUFRQTtlQUNoREEsUUFBUUEsSUFBSUEsS0FBS0E7ZUFDakJBLFFBQVFBLElBQUlBLFdBQVdBLENBQUNBLENBQUNBLENBQUNBO1lBQzdCQSxPQUFPQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxFQUFFQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN4Q0EsQ0FBQ0E7SUFDSEEsQ0FBQ0E7QUFDSEEsQ0FBQ0EiLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VzQ29udGVudCI6WyIvLy8gPHJlZmVyZW5jZSBwYXRoPVwibm9kZS5kLnRzXCIgLz5cbmRlY2xhcmUgZnVuY3Rpb24gcmVxdWlyZShuYW1lOiBzdHJpbmcpO1xucmVxdWlyZSgnc291cmNlLW1hcC1zdXBwb3J0JykuaW5zdGFsbCgpO1xuXG5pbXBvcnQgZnMgPSByZXF1aXJlKCdmcycpO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbih7IHR5cGVzOiB0IH0pIHtcblx0dmFyIHN0YXJ0ID0gLTEsXG4gICAgICBvYnNlcnZlcnMgPSB7fSxcbiAgICAgIGxpc3RlbmVycyA9IHt9LFxuICAgICAgcG9zdENvbnN0dWN0U2V0dGVycyA9IHt9O1xuXG4gIGZ1bmN0aW9uIHRvRGFzaENhc2Uoc3RyOiBzdHJpbmcpe1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvKFthLXpdKykoW0EtWl0pL2csIGZ1bmN0aW9uKCQwLCAkMSwgJDIpe3JldHVybiAkMSArICctJyArICQyO30pLnRvTG93ZXJDYXNlKCk7XG4gIH0gICAgXG5cbiAgZnVuY3Rpb24gdG9VcHBlckNhbWVsKHN0cjogc3RyaW5nKXtcbiAgICByZXR1cm4gc3RyLnJlcGxhY2UoL15bYS16XXwoXFwtW2Etel0pL2csIGZ1bmN0aW9uKCQxKXtyZXR1cm4gJDEudG9VcHBlckNhc2UoKS5yZXBsYWNlKCctJywnJyk7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVEZWNvcmF0b3IobmFtZTogc3RyaW5nLCB2YWx1ZSkge1xuICAgICAgcmV0dXJuIHQuZGVjb3JhdG9yKHQuY2FsbEV4cHJlc3Npb24odC5pZGVudGlmaWVyKG5hbWUpLFxuICAgICAgICAgICAgICBbdHlwZW9mIHZhbHVlID09ICdzdHJpbmcnID8gdC5zdHJpbmdMaXRlcmFsKHZhbHVlKSA6IHZhbHVlXSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoa2V5OiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcpIHtcbi8vY29uc29sZS5pbmZvKCctLS0tLS0tLS0tLS0tLS0tLSBjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eTonLCB2YWx1ZSkgICAgO1xuLy9jb25zb2xlLmluZm8oJ3R0dHR0dHR0dHR0dHR0dHR0IHR5cGU6JywgdHlwZW9mIHZhbHVlKTtcbiAgICBzd2l0Y2godHlwZW9mIHZhbHVlKSB7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIHJldHVybiB0Lm9iamVjdFByb3BlcnR5KFxuICAgICAgICB0LmlkZW50aWZpZXIoa2V5KSxcbiAgICAgICAgdmFsdWVcbiAgICAgICk7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICB2YWx1ZSA9IHZhbHVlLnRvU3RyaW5nKCk7XG4gICAgfVxuICAgIHJldHVybiB0Lm9iamVjdFByb3BlcnR5KFxuICAgICAgdC5pZGVudGlmaWVyKGtleSksXG4gICAgICB0LmlkZW50aWZpZXIodmFsdWUpXG4gICAgKTtcbiAgfVxuXG4gIC8qKiBAcGFyYW0gdHlwZSAtIG9uZSBvZiBCb29sZWFuLCBEYXRlLCBOdW1iZXIsIFN0cmluZywgQXJyYXkgb3IgT2JqZWN0ICovXG4gIGZ1bmN0aW9uIGNyZWF0ZVR5cGVBbm5vdGF0aW9uKHR5cGU6IHN0cmluZywgZWxlbWVudFR5cGUgPSAnYW55Jykge1xuICAgIHN3aXRjaCh0eXBlLnRvTG93ZXJDYXNlKCkpIHtcbiAgICBjYXNlICdzdHJpbmcnOlxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5zdHJpbmdUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIC8vIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuYm9vbGVhblR5cGVBbm5vdGF0aW9uKCkpO1xuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5nZW5lcmljVHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKCdib29sZWFuJykpKTtcbiAgICBjYXNlICdkYXRlJzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuZGF0ZVR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0Lm51bWJlclR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ2FycmF5JzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuYXJyYXlUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoZWxlbWVudFR5cGUpKSk7XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICBkZWZhdWx0OlxuLy9jb25zb2xlLmluZm8oJ1RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFR0IHR5cGU6JywgdHlwZSk7ICAgIFxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5nZW5lcmljVHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKHR5cGUpKSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzKGVsZW1lbnRzKSB7XG4gICAgcmV0dXJuIGVsZW1lbnRzLnJlZHVjZSggKHJlc3VsdHMsIHNpZ25hdHVyZSkgPT4ge1xuICAgICAgLy8gam9pbiBtdWx0aS1saW5lIHN0cmluZ3NcbiAgICAgIGxldCB2YWx1ZSA9ICcnO1xuICAgICAgd2hpbGUodC5pc0JpbmFyeUV4cHJlc3Npb24oc2lnbmF0dXJlKSkge1xuICAgICAgICAvLyB2YWx1ZSA9ICgoc2lnbmF0dXJlLmxlZnQudmFsdWUgfHwgc2lnbmF0dXJlLmxlZnQucmlnaHQudmFsdWUpICsgc2lnbmF0dXJlLnJpZ2h0LnZhbHVlO1xuICAgICAgICB2YWx1ZSA9IHNpZ25hdHVyZS5yaWdodC52YWx1ZSArIHZhbHVlO1xuICAgICAgICBzaWduYXR1cmUgPSBzaWduYXR1cmUubGVmdDtcbiAgICAgIH1cbiAgICAgIHZhbHVlID0gc2lnbmF0dXJlLnZhbHVlICsgdmFsdWU7XG5cbiAgICAgIGxldCBtYXRjaCA9IHZhbHVlLm1hdGNoKC8oW15cXChdKylcXCgoW15cXCldKykvKSxcbiAgICAgICAgZnVuY3Rpb25OYW1lID0gbWF0Y2hbMV0sXG4gICAgICAgIG9ic2VydmVkUHJvcGVydGllcyA9IG1hdGNoWzJdO1xuICAgICAgcmVzdWx0c1tmdW5jdGlvbk5hbWVdID0gY3JlYXRlRGVjb3JhdG9yKCdvYnNlcnZlJywgb2JzZXJ2ZWRQcm9wZXJ0aWVzKTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0sIHt9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lckV2ZW50TGlzdGVuZXJQcm9wZXJ0aWVzKHByb3BlcnRpZXMpIHtcbiAgICByZXR1cm4gcHJvcGVydGllcy5yZWR1Y2UoIChyZXN1bHRzLCBwcm9wZXJ0eSkgPT4ge1xuICAgICAgbGV0IGV2ZW50TmFtZSA9IHByb3BlcnR5LmtleS52YWx1ZSB8fCBwcm9wZXJ0eS5rZXkubmFtZSxcbiAgICAgICAgICBmdW5jdGlvbk5hbWUgPSBwcm9wZXJ0eS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBmdW5jdGlvbkV2ZW50cyA9IHJlc3VsdHNbZnVuY3Rpb25OYW1lXTtcbiAgICAgIGlmKCFmdW5jdGlvbkV2ZW50cykge1xuICAgICAgICBmdW5jdGlvbkV2ZW50cyA9IHJlc3VsdHNbZnVuY3Rpb25OYW1lXSA9IFtdO1xuICAgICAgfVxuICAgICAgZnVuY3Rpb25FdmVudHMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2xpc3RlbicsIGV2ZW50TmFtZSkpO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSwge30pO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQmVoYXZpb3JSZWZlcmVuY2UodXNlQmVoYXZpb3JEZWNvcmF0b3IsIG5vZGUpIHtcbiAgICByZXR1cm4gdXNlQmVoYXZpb3JEZWNvcmF0b3IgPyBjcmVhdGVEZWNvcmF0b3IoJ2JlaGF2aW9yJywgbm9kZSkgOiBub2RlO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VOb25Qb2x5bWVyRnVuY3Rpb24obm9kZSkge1xuICAgIGxldCBuYW1lID0gbm9kZS5rZXkubmFtZSxcbiAgICAgIHBhcmFtcyA9IG5vZGUudmFsdWUucGFyYW1zLFxuICAgICAgYm9keSAvKjogQXJyYXk8U3RhdGVtZW50ICovID0gbm9kZS52YWx1ZS5ib2R5LmJvZHk7XG5cbiAgICBsZXQgbWV0aG9kID0gdC5jbGFzc01ldGhvZCgnbWV0aG9kJywgdC5pZGVudGlmaWVyKG5hbWUpLCBwYXJhbXMsIHQuYmxvY2tTdGF0ZW1lbnQoYm9keSkpO1xuXG4gICAgLy8gQXR0ZW1wdCB0byBndWVzcyB0aGUgdHlwZXMgZnJvbSBwYXJhbWV0ZXIgbmFtZXNcbiAgICBpZiAobm9kZS52YWx1ZS5wYXJhbXMpIHtcbiAgICAgIG5vZGUudmFsdWUucGFyYW1zLmZvckVhY2goIChwYXJhbSkgPT4ge1xuICAgICAgICBsZXQgdHlwZSA9IG51bGw7XG5cbiAgICAgICAgcGFyYW0ub3B0aW9uYWwgPSAhIXBhcmFtLm5hbWUubWF0Y2goL15vcHQvKTtcblxuICAgICAgICBzd2l0Y2gocGFyYW0ubmFtZSkge1xuICAgICAgICBjYXNlICdlbCc6XG4gICAgICAgICAgdHlwZSA9ICdIVE1MRWxlbWVudCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdldmVudCc6XG4gICAgICAgICAgdHlwZSA9ICdFdmVudCc7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGlmIChuYW1lLm1hdGNoKC9FbGVtZW50JC8pKSB7XG4gICAgICAgICAgICB0eXBlID0gJ0hUTUxFbGVtZW50JztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIHBhcmFtLnR5cGVBbm5vdGF0aW9uID0gY3JlYXRlVHlwZUFubm90YXRpb24odHlwZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvbWUgZnVuY3Rpb25zIGhhdmUgSlNEb2MgYW5ub3RhdGlvbnNcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9jbG9zdXJlL2NvbXBpbGVyL2RvY3MvanMtZm9yLWNvbXBpbGVyI3R5cGVzXG4gICAgaWYgKG5vZGUubGVhZGluZ0NvbW1lbnRzKSB7XG4gICAgICBsZXQgdHlwZWRQYXJhbXMgPSBub2RlLmxlYWRpbmdDb21tZW50c1swXS52YWx1ZS5tYXRjaCgvQHBhcmFtIHtbXn1dK30gXFxTKy9nKTtcbiAgICAgIGlmICh0eXBlZFBhcmFtcykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHR5cGVkUGFyYW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgbGV0IHR5cGVkUGFyYW0gPSB0eXBlZFBhcmFtc1tpXSxcbiAgICAgICAgICAgICAgbWF0Y2ggPSB0eXBlZFBhcmFtLm1hdGNoKC97IT8oW149fV0rKSg9Pyl9IChcXFMrKS8pLFxuICAgICAgICAgICAgICB0eXBlID0gbWF0Y2hbMV0sXG4gICAgICAgICAgICAgIHBhcmFtID0gbWF0Y2hbM107XG5cbiAgICAgICAgICBpZiAoISFtYXRjaFsyXSkge1xuICAgICAgICAgICAgbm9kZS52YWx1ZS5wYXJhbXNbaV0ub3B0aW9uYWwgPSB0cnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIC8vIHJlbW92ZSAndW5kZWZpbmVkJ1xuICAgICAgICAgIG1hdGNoID0gdHlwZS5tYXRjaCgvKC4qW158XSk/XFx8P3VuZGVmaW5lZFxcfD8oLiopLyk7XG4gICAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBpZiAobWF0Y2hbMV0pIHtcbiAgICAgICAgICAgICAgdHlwZSA9IG1hdGNoWzJdID8gKG1hdGNoWzFdICsgJ3wnICsgbWF0Y2hbMl0pIDogbWF0Y2hbMV07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0eXBlID0gbWF0Y2hbMl07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKG5vZGUudmFsdWUucGFyYW1zW2ldLm5hbWUgPT0gcGFyYW0pIHtcbiAgICAgICAgICAgIG5vZGUudmFsdWUucGFyYW1zW2ldLnR5cGVBbm5vdGF0aW9uID0gY3JlYXRlVHlwZUFubm90YXRpb24odHlwZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybigncGFyYW0nLCBpLCAnKCcgKyBub2RlLnZhbHVlLnBhcmFtc1tpXSArICcpICE9JywgcGFyYW0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBtZXRob2QubGVhZGluZ0NvbW1lbnRzID0gbm9kZS5sZWFkaW5nQ29tbWVudHM7XG4gICAgfVxuXG4gICAgcmV0dXJuIG1ldGhvZDtcbiAgfVxuXG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyUHJvcGVydHkocHJvcGVydHkpIC8qOiBDbGFzc1Byb3BlcnR5ICovIHtcbi8vY29uc29sZS5pbmZvKCcjIyMjIyMjIyMjIyMjIHBhcnNlUG9seW1lclByb3BlcnR5OicsIHByb3BlcnR5KSAgICA7XG4gICAgbGV0IG5hbWU6IHN0cmluZyA9IHByb3BlcnR5LmtleS5uYW1lLFxuICAgICAgICBhdHRyaWJ1dGVzID0gcHJvcGVydHkudmFsdWUucHJvcGVydGllcyxcbiAgICAgICAgdHlwZSwgdmFsdWUsIGlzRnVuY3Rpb24sIHBhcmFtcywgcmVhZG9ubHkgPSBmYWxzZSwgZGVjb3JhdG9yUHJvcHMgPSBbXTtcblxuICAgIGlmKHQuaXNJZGVudGlmaWVyKHByb3BlcnR5LnZhbHVlKSkge1xuICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKHByb3BlcnR5LnZhbHVlLm5hbWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBhdHRyaWJ1dGVzLmZvckVhY2goIChhdHRyaWJ1dGUpID0+IHtcbi8vY29uc29sZS5pbmZvKCcgICAmJiYmJiYmJiYmJiYmJiYmIGF0dHJpYnV0ZTonLCBhdHRyaWJ1dGUpICAgICAgICA7XG4gICAgICAgIGxldCBhdHRyX25hbWU6IHN0cmluZyA9IGF0dHJpYnV0ZS5rZXkubmFtZTtcbiAgICAgICAgc3dpdGNoKGF0dHJfbmFtZSkge1xuICAgICAgICBjYXNlICd0eXBlJzpcbiAgICAgICAgICAvLyBvbmUgb2YgQm9vbGVhbiwgRGF0ZSwgTnVtYmVyLCBTdHJpbmcsIEFycmF5IG9yIE9iamVjdFxuICAgICAgICAgIHR5cGUgPSBjcmVhdGVUeXBlQW5ub3RhdGlvbihhdHRyaWJ1dGUudmFsdWUubmFtZSk7XG4vLy9jb25zb2xlLmluZm8oJy0+Pj4+Pj4+Pj4+Pj4+IGluZmVycmVkIHR5cGU6JywgdHlwZSk7ICAgICAgICAgIFxuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCBhdHRyaWJ1dGUudmFsdWUubmFtZSkpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICd2YWx1ZSc6XG4gICAgICAgICAgLy8gRGVmYXVsdCB2YWx1ZSBmb3IgdGhlIHByb3BlcnR5XG4gICAgICAgICAgdmFsdWUgPSBhdHRyaWJ1dGUudmFsdWU7XG4vL2NvbnNvbGUuaW5mbygnLT4+Pj4+Pj4+Pj4+Pj4+Pj4gaW5mZXJyZWQgdmFsdWU6JywgdmFsdWUpOyAgICAgICAgICBcbiAgICAgICAgICAvL2RlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCBhdHRyaWJ1dGUudmFsdWUpKTtcbiAgICAgICAgICBpZih0LmlzRnVuY3Rpb25FeHByZXNzaW9uKHZhbHVlKSkge1xuICAgICAgICAgICAgaXNGdW5jdGlvbiA9IHRydWU7XG4gICAgICAgICAgICBwYXJhbXMgPSBbXTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYodHlwZSA9PT0gdW5kZWZpbmVkICYmICF0LmlzTnVsbExpdGVyYWwodmFsdWUpKSB7XG4gICAgICAgICAgICBpZiAodC5pc0NhbGxFeHByZXNzaW9uKHZhbHVlKSkge1xuICAgICAgICAgICAgICAvLyBUT0RPOiBkZXRlcm1pbmUgYWN0dWFsIHR5cGVcbiAgICAgICAgICAgICAgdHlwZSA9IHQudHlwZUFubm90YXRpb24odC5nZW5lcmljVHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKCdvYmplY3QnKSkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0LmlzRnVuY3Rpb25FeHByZXNzaW9uKHZhbHVlKSkge1xuICAgICAgICAgICAgICB0eXBlID0gdC50eXBlQW5ub3RhdGlvbih0LmZ1bmN0aW9uVHlwZUFubm90YXRpb24oKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0eXBlID0gdC5jcmVhdGVUeXBlQW5ub3RhdGlvbkJhc2VkT25UeXBlb2YodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAncmVhZE9ubHknOlxuICAgICAgICAgIHJlYWRvbmx5ID0gdHJ1ZTtcbiAgICAgICAgICAvLyBmYWxsLXRocm91Z2hcbiAgICAgICAgY2FzZSAncmVmbGVjdFRvQXR0cmlidXRlJzpcbiAgICAgICAgY2FzZSAnbm90aWZ5JzpcbiAgICAgICAgICBkZWNvcmF0b3JQcm9wcy5wdXNoKGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGF0dHJfbmFtZSwgYXR0cmlidXRlLnZhbHVlLnZhbHVlKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ2NvbXB1dGVkJzpcbiAgICAgICAgY2FzZSAnb2JzZXJ2ZXInOlxuICAgICAgICAgIC8vIGNvbXB1dGVkIGZ1bmN0aW9uIGNhbGwgKGFzIHN0cmluZylcbi8vIGNvbnNvbGUuaW5mbygnPT09PT09PT09PT0nLCBhdHRyaWJ1dGUudmFsdWUpICAgICAgICAgIDtcbiAgICAgICAgICBkZWNvcmF0b3JQcm9wcy5wdXNoKGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGF0dHJfbmFtZSwgJ1xcJycgKyBhdHRyaWJ1dGUudmFsdWUudmFsdWUgKyAnXFwnJykpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGNvbnNvbGUud2FybignVW5leHBlY3RlZCBwcm9wZXJ0eSBhdHRyaWJ1dGU6ICcsIGF0dHJpYnV0ZS5rZXkubmFtZSwgJ2F0IGxpbmUnLCBhdHRyaWJ1dGUubG9jLnN0YXJ0LmxpbmUpO1xuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCBhdHRyaWJ1dGUudmFsdWUudmFsdWUpKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgbGV0IGRlY29yYXRvcnMgPSBbdC5kZWNvcmF0b3IoXG4gICAgICAgICAgdC5jYWxsRXhwcmVzc2lvbihcbiAgICAgICAgICAgIHQuaWRlbnRpZmllcigncHJvcGVydHknKSxcbiAgICAgICAgICAgIFt0Lm9iamVjdEV4cHJlc3Npb24oZGVjb3JhdG9yUHJvcHMpXVxuICAgICAgICAgIClcbiAgICAgICAgKV07XG5cbiAgICBpZihpc0Z1bmN0aW9uKSB7XG4gICAgICBwb3N0Q29uc3R1Y3RTZXR0ZXJzW25hbWVdID0gdmFsdWUuYm9keS5ib2R5O1xuICAgICAgdmFyIHJlc3VsdCA9IHQuY2xhc3NQcm9wZXJ0eSh0LmlkZW50aWZpZXIobmFtZSksIHVuZGVmaW5lZCwgdHlwZSwgZGVjb3JhdG9ycyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciByZXN1bHQgPSB0LmNsYXNzUHJvcGVydHkodC5pZGVudGlmaWVyKG5hbWUpLCB2YWx1ZSwgdHlwZSwgZGVjb3JhdG9ycyk7XG4gICAgfVxuXG4gICAgcmVzdWx0LmxlYWRpbmdDb21tZW50cyA9IHByb3BlcnR5LmxlYWRpbmdDb21tZW50cztcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG5cbiAgdmFyIHBvbHltZXJQYXRoc0J5RmlsZU5hbWUgPSB7XG4gICAgJ2lyb24tYnV0dG9uLXN0YXRlJzogJ2lyb24tYmVoYXZpb3JzJyxcbiAgICAnaXJvbi1jb250cm9sLXN0YXRlJzogJ2lyb24tYmVoYXZpb3JzJyxcbiAgICAnaXJvbi1tZW51LWJlaGF2aW9yJzogJ2lyb24tbWVudS1iZWhhdmlvcicsXG4gICAgJ2lyb24tbWVudWJhci1iZWhhdmlvcic6ICdpcm9uLW1lbnUtYmVoYXZpb3InLFxuICAgICdpcm9uLW11bHRpLXNlbGVjdGFibGUtYmVoYXZpb3InOiAnaXJvbi1zZWxlY3RvcicsXG4gICAgJ2lyb24tc2VsZWN0YWJsZSc6ICdpcm9uLXNlbGVjdG9yJyxcbiAgICAnaXJvbi1zZWxlY3Rpb24nOiAnaXJvbi1zZWxlY3RvcicsXG4gICAgJ3BhcGVyLWJ1dHRvbi1iZWhhdmlvcic6ICdwYXBlci1iZWhhdmlvcnMnLFxuICAgICdwYXBlci1jaGVja2VkLWVsZW1lbnQtYmVoYXZpb3InOiAncGFwZXItYmVoYXZpb3JzJyxcbiAgICAncGFwZXItaW5reS1mb2N1cy1iZWhhdmlvcic6ICdwYXBlci1iZWhhdmlvcnMnLFxuICAgICdwYXBlci1yaXBwbGUtYmVoYXZpb3InOiAncGFwZXItYmVoYXZpb3JzJ1xuICB9O1xuICBmdW5jdGlvbiBnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lKGZpbGVQYXRoOiBzdHJpbmcsIGR0c0ZpbGVOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICAgIGR0c0ZpbGVOYW1lID0gZHRzRmlsZU5hbWUucmVwbGFjZSgvLWltcGwkLywgJycpO1xuICAgIHZhciBwYXRoID0gcG9seW1lclBhdGhzQnlGaWxlTmFtZVtkdHNGaWxlTmFtZV07XG4vL2NvbnNvbGUuaW5mbygnLi4uLi4uLi4uLi4uLi4uLi4uLi5sb29raW5nIGZvciAnICsgZHRzRmlsZU5hbWUsICdpbicsIGZpbGVQYXRoKTtcblxuICAgIGlmKCFwYXRoKSB7XG4vL2NvbnNvbGUuaW5mbygnMTExMTExMTExMTExMTExMTExMTEgJywgZmlsZVBhdGggKyAnLi4uJyArIGR0c0ZpbGVOYW1lICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmh0bWwnKTsgICAgICBcbiAgICAgIGlmKHZlcmlmeVBhdGhFeGlzdHMoZmlsZVBhdGggKyBkdHNGaWxlTmFtZSArICcvJyArIGR0c0ZpbGVOYW1lICsgJy5odG1sJykpIHtcbiAgICAgICAgcmV0dXJuIGR0c0ZpbGVOYW1lO1xuICAgICAgfVxuICAgICAgcGF0aCA9IGR0c0ZpbGVOYW1lLm1hdGNoKC9bXi1dKy1bXi1dKy8pWzBdO1xuLy9jb25zb2xlLmluZm8oJzIyMjIyMjIyMjIyMjIyMjIyMjIyICcsIGZpbGVQYXRoICsgJy4uLicgKyBwYXRoICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmh0bWwnKTsgICAgICBcbiAgICAgIGlmKHZlcmlmeVBhdGhFeGlzdHMoZmlsZVBhdGggKyBwYXRoICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmh0bWwnKSkge1xuICAgICAgICByZXR1cm4gcGF0aDtcbiAgICAgIH1cblxuY29uc29sZS5pbmZvKCchISEhISEhISEhISEhISEhISEhISEhISEhIGZhaWxlZCB0byBmaW5kIHBhdGggZm9yJywgZHRzRmlsZU5hbWUpOyAgICAgIFxuICAgIH1cblxuICAgIHJldHVybiBwYXRoO1xuICB9XG5cbiAgZnVuY3Rpb24gdmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCk6IGJvb2xlYW4ge1xuICAgIHRyeSB7XG4gICAgICBpZihmcy5hY2Nlc3NTeW5jKSB7XG4gICAgICAgIGZzLmFjY2Vzc1N5bmMoZmlsZVBhdGgsIGZzLkZfT0spO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgZnMubHN0YXRTeW5jKGZpbGVQYXRoKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBhZGRUeXBlRGVmaW5pdGlvblJlZmVyZW5jZShwYXRoLCBzdGF0ZSwgZHRzRmlsZU5hbWU/OiBzdHJpbmcpIHtcbiAgICAvLyBGaW5kIHRoZSBmaWxlJ3MgcmVsYXRpdmUgcGF0aCB0byBib3dlcl9jb21wb25lbnRzXG4gICAgdmFyIGZpbGVQYXRoID0gc3RhdGUuZmlsZS5vcHRzLmZpbGVuYW1lLCBkb3RzID0gJyc7XG4gICAgd2hpbGUoZmlsZVBhdGgpIHtcbiAgICAgIGZpbGVQYXRoID0gZmlsZVBhdGgubWF0Y2goLyguKilcXC8uKi8pO1xuICAgICAgZmlsZVBhdGggPSBmaWxlUGF0aCAmJiBmaWxlUGF0aFsxXTtcbiAgICAgIGlmKGZpbGVQYXRoKSB7XG4gICAgICAgIGlmKHZlcmlmeVBhdGhFeGlzdHMoZmlsZVBhdGggKyAnL2Jvd2VyX2NvbXBvbmVudHMnKSkge1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRvdHMgKz0gJy4uLyc7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBXcml0ZSBvdXQgdGhlIFR5cGVTY3JpcHQgY29kZVxuICAgIGlmKGR0c0ZpbGVOYW1lKSB7XG4gICAgICBsZXQgZHRzUGF0aCA9IGdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUoZmlsZVBhdGggKyAnL2Jvd2VyX2NvbXBvbmVudHMvJywgZHRzRmlsZU5hbWUpO1xuICAgICAgc3RhdGUuZmlsZS5wYXRoLmFkZENvbW1lbnQoJ2xlYWRpbmcnLCAnLyA8cmVmZXJlbmNlIHBhdGg9XCInICsgZG90cyArICd0eXBpbmdzLycgKyBkdHNQYXRoICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmQudHNcIi8+JywgdHJ1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0YXRlLmZpbGUucGF0aC5hZGRDb21tZW50KCdsZWFkaW5nJywgJy8gPHJlZmVyZW5jZSBwYXRoPVwiJyArIGRvdHMgKyAnYm93ZXJfY29tcG9uZW50cy9wb2x5bWVyLXRzL3BvbHltZXItdHMuZC50c1wiLz4nLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuLypcblRPRE86IFxuLSBuZWVkIHRvIGV4cG9ydCBiZWhhdmlvciBjbGFzc2VzXG4tIC8vLyA8cmVmZXJlbmNlIHBhdGg9XCIuLi8uLi9ib3dlcl9jb21wb25lbnRzLy4uLi4uXG4qL1xuICAvKipcbiAgICBUSGUgaW1wbGVtZW50YXRpb24gb2YgdGhpcyBwcm9iYWJseSBpc24ndCBzcG90IG9uLCBmb3Igbm93IEkganVzdCB3YW50IHRvIGV4dHJhY3QgZW5vdWdoIHRvIGdlbmVyYXRlIC5kLnRzIGZpbGVzXG4gICAgZm9yIHRoZSBQb2x5bWVyIE1hdGVyaWFsIGNvbXBvbmVudHMuXG4gICAgKi9cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQmVoYXZpb3JEZWZpbml0aW9uKGFycmF5RXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIG1lbWJlckV4cHJlc3Npb24pIHtcbiAgICBsZXQgY2xhc3NEZWNsYXJhdGlvbiA9IHQuY2xhc3NEZWNsYXJhdGlvbih0LmlkZW50aWZpZXIobWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2xhc3NCb2R5KFtdKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBbXSk7XG4vL2NvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0nLCBhcnJheUV4cHJlc3Npb24pICAgICAgO1xuICAgIGNsYXNzRGVjbGFyYXRpb24uaW1wbGVtZW50cyA9IGFycmF5RXhwcmVzc2lvbi5lbGVtZW50cy5tYXAoIChiZWhhdmlvcikgPT4ge1xuLy9jb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tJywgYmVoYXZpb3IucHJvcGVydHkubmFtZSwgbWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lKSAgICAgIDtcbiAgICAgIGlmKGJlaGF2aW9yLnByb3BlcnR5Lm5hbWUgIT0gbWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lICsgJ0ltcGwnKSB7XG4gICAgICAgIGFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlKHBhdGgsIHN0YXRlLCB0b0Rhc2hDYXNlKGJlaGF2aW9yLnByb3BlcnR5Lm5hbWUpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0LmNsYXNzSW1wbGVtZW50cyhiZWhhdmlvci5wcm9wZXJ0eSk7XG4gICAgfSk7XG4gICAgLy9jbGFzc0RlY2xhcmF0aW9uLm1vZGlmaWVycyA9IFt0LmFic3JhY3RdXG4gICAgXG4gICAgcGF0aC5wYXJlbnRQYXRoLnJlcGxhY2VXaXRoKHQuZGVjbGFyZU1vZHVsZSh0LmlkZW50aWZpZXIobWVtYmVyRXhwcmVzc2lvbi5vYmplY3QubmFtZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmJsb2NrU3RhdGVtZW50KFtjbGFzc0RlY2xhcmF0aW9uXSkpKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lckNsYXNzKG9iamVjdEV4cHJlc3Npb24sIHBhdGgsIHN0YXRlLCBtZW1iZXJFeHByZXNzaW9uPykge1xuLy9jb25zb2xlLmluZm8oJz09PT09PT09PT09PT09PT09PT09PT09PT09PW9iamVjdEV4cHJlc3Npb246Jywgb2JqZWN0RXhwcmVzc2lvbik7ICAgIFxuLy9jb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLW1lbWJlckV4cHJlc3Npb246JywgbWVtYmVyRXhwcmVzc2lvbik7XG4gICAgbGV0IGNsYXNzTmFtZSwgZWxlbWVudE5hbWUsXG4gICAgICAgICAgICAgICAgZXh0ZW5kLCBiZWhhdmlvcnMsIGhvc3RBdHRyaWJ1dGVzLFxuICAgICAgICAgICAgICAgIHByb3BlcnRpZXMgLyo6IEFycmF5PENsYXNzUHJvcGVydHk+ICovID0gW10sXG4gICAgICAgICAgICAgICAgY29uc3RydWN0b3IsXG4gICAgICAgICAgICAgICAgZnVuY3Rpb25zIC8qOiBBcnJheTxDbGFzc01ldGhvZD4qLyA9IFtdO1xuXG4gICAgb2JqZWN0RXhwcmVzc2lvbi5wcm9wZXJ0aWVzLmZvckVhY2goIChjb25maWcpID0+IHtcbiAvLyBjb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tLS0tLS0tLScsIGNvbmZpZyk7XG4gICAgICBzd2l0Y2goY29uZmlnLmtleS5uYW1lKSB7XG4gICAgICBjYXNlICdpcyc6XG4gICAgICAgIGVsZW1lbnROYW1lID0gY29uZmlnLnZhbHVlLnZhbHVlO1xuICAgICAgICBjbGFzc05hbWUgPSB0b1VwcGVyQ2FtZWwoY29uZmlnLnZhbHVlLnZhbHVlKTtcbiAgICAgICAgY29uc29sZS5pbmZvKCdQYXJzaW5nIFBvbHltZXIgZWxlbWVudCcsIGVsZW1lbnROYW1lLCAnaW4nLCBzdGF0ZS5maWxlLm9wdHMuZmlsZW5hbWUpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2V4dGVuZHMnOlxuICAgICAgICBleHRlbmQgPSBjb25maWcudmFsdWUudmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnYmVoYXZpb3JzJzpcbiAgICAgICAgYmVoYXZpb3JzID0gY29uZmlnLnZhbHVlLmVsZW1lbnRzLm1hcChwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZS5iaW5kKHVuZGVmaW5lZCwgc3RhdGUub3B0cy51c2VCZWhhdmlvckRlY29yYXRvcikpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ3Byb3BlcnRpZXMnOlxuICAgICAgICBwcm9wZXJ0aWVzID0gY29uZmlnLnZhbHVlLnByb3BlcnRpZXMubWFwKHBhcnNlUG9seW1lclByb3BlcnR5KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdob3N0QXR0cmlidXRlcyc6XG4gICAgICAgIGhvc3RBdHRyaWJ1dGVzID0gY29uZmlnLnZhbHVlO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ29ic2VydmVycyc6XG4gICAgICAgIG9ic2VydmVycyA9IHBhcnNlUG9seW1lckZ1bmN0aW9uU2lnbmF0dXJlUHJvcGVydGllcyhjb25maWcudmFsdWUuZWxlbWVudHMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2xpc3RlbmVycyc6XG4gICAgICAgIGxpc3RlbmVycyA9IHBhcnNlUG9seW1lckV2ZW50TGlzdGVuZXJQcm9wZXJ0aWVzKGNvbmZpZy52YWx1ZS5wcm9wZXJ0aWVzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICBpZih0LmlzT2JqZWN0TWV0aG9kKGNvbmZpZykpIHtcbiAgICAgICAgICBmdW5jdGlvbnMucHVzaCh0LmNsYXNzTWV0aG9kKGNvbmZpZy5raW5kLCBjb25maWcua2V5LCBjb25maWcucGFyYW1zLCBjb25maWcuYm9keSwgY29uZmlnLmNvbXB1dGVkLCBjb25maWcuc3RhdGljKSk7XG4gICAgICAgIH0gZWxzZSBpZih0LmlzRnVuY3Rpb25FeHByZXNzaW9uKGNvbmZpZy52YWx1ZSkpIHtcbiAgICAgICAgICBsZXQgbWV0aG9kID0gcGFyc2VOb25Qb2x5bWVyRnVuY3Rpb24oY29uZmlnKTtcblxuICAgICAgICAgIGlmKG1ldGhvZC5rZXkubmFtZSA9PSAnZmFjdG9yeUltcGwnKSB7XG4gICAgICAgICAgICBtZXRob2Qua2V5Lm5hbWUgPSBtZXRob2Qua2luZCA9ICdjb25zdHJ1Y3Rvcic7XG4gICAgICAgICAgICBjb25zdHJ1Y3RvciA9IG1ldGhvZDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQWRkIG9ic2VydmVyIGRlY29yYXRvcnNcbiAgICAgICAgICAgIGxldCBmdW5jdGlvbk9ic2VydmVyID0gb2JzZXJ2ZXJzW21ldGhvZC5rZXkubmFtZV07XG4gICAgICAgICAgICBpZihmdW5jdGlvbk9ic2VydmVyKSB7XG4gICAgICAgICAgICAgIGlmKCFtZXRob2QuZGVjb3JhdG9ycykgeyBtZXRob2QuZGVjb3JhdG9ycyA9IFtdOyB9XG4gICAgICAgICAgICAgICAgbWV0aG9kLmRlY29yYXRvcnMucHVzaChmdW5jdGlvbk9ic2VydmVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQWRkIGxpc3RlbmVyIGRlY29yYXRvcnNcbiAgICAgICAgICAgIGxldCBmdW5jdGlvbkxpc3RlbmVycyA9IGxpc3RlbmVyc1ttZXRob2Qua2V5Lm5hbWVdO1xuICAgICAgICAgICAgaWYoZnVuY3Rpb25MaXN0ZW5lcnMpIHtcbiAgICAgICAgICAgICAgZnVuY3Rpb25MaXN0ZW5lcnMuZm9yRWFjaCggKGxpc3RlbmVyKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYoIW1ldGhvZC5kZWNvcmF0b3JzKSB7IG1ldGhvZC5kZWNvcmF0b3JzID0gW107IH1cbiAgICAgICAgICAgICAgICBtZXRob2QuZGVjb3JhdG9ycy5wdXNoKGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmdW5jdGlvbnMucHVzaChtZXRob2QpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0LmlzT2JqZWN0RXhwcmVzc2lvbikge1xuICAgICAgICAgIHByb3BlcnRpZXMucHVzaCh0LmNsYXNzUHJvcGVydHkodC5pZGVudGlmaWVyKGNvbmZpZy5rZXkubmFtZSksIGNvbmZpZy52YWx1ZSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGNvbnNvbGUud2FybihcIiEhISEhISEhISEhIFVuZXhwZWN0ZWQgcHJvcGVydHk6XCIsIGNvbmZpZy5rZXkgKyAnOicsIGNvbmZpZy52YWx1ZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGxldCBkZWNvcmF0b3JzID0gW11cbiAgICBpZihlbGVtZW50TmFtZSkge1xuICAgICAgZGVjb3JhdG9ycy5wdXNoKGNyZWF0ZURlY29yYXRvcignY29tcG9uZW50JywgZWxlbWVudE5hbWUpKTtcbiAgICAgIGlmKGV4dGVuZCkge1xuICAgICAgICBkZWNvcmF0b3JzLnB1c2goY3JlYXRlRGVjb3JhdG9yKCdleHRlbmQnLCBleHRlbmQpKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYoaG9zdEF0dHJpYnV0ZXMpIHtcbiAgICAgIGRlY29yYXRvcnMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2hvc3RBdHRyaWJ1dGVzJywgaG9zdEF0dHJpYnV0ZXMpKTtcbiAgICB9XG4gICAgaWYoYmVoYXZpb3JzICYmIHN0YXRlLm9wdHMudXNlQmVoYXZpb3JEZWNvcmF0b3IpIHtcbiAgICAgIGRlY29yYXRvcnMgPSBkZWNvcmF0b3JzLmNvbmNhdChiZWhhdmlvcnMpO1xuICAgIH1cblxuICAgIC8vIEFkZCBhbnkgcG9zdENvbnN0cnVjdG9yU2V0dGVycyAoUG9seW1lciBwcm9wZXJ0aWVzIHdpdGggYSBmdW5jdGlvbiBmb3IgYHZhbHVlYClcbiAgICBsZXQgY29uc3R1Y3RvckJvZHkgLyo6IEFycmF5PFN0YXRlbWVudD4qLyA9IGNvbnN0cnVjdG9yID8gY29uc3RydWN0b3IuYm9keS5ib2R5IDogW107XG5cbiAgICBmb3IodmFyIGtleSBpbiBwb3N0Q29uc3R1Y3RTZXR0ZXJzKSB7XG4gICAgICBsZXQgcG9zdENvbnN0dWN0U2V0dGVyIC8qOiBCbG9ja1N0YXRlbWVudCB8IEV4cHJlc3Npb24gKi8gPSBwb3N0Q29uc3R1Y3RTZXR0ZXJzW2tleV07XG4gICAgICBjb25zdHVjdG9yQm9keS5wdXNoKHQuZXhwcmVzc2lvblN0YXRlbWVudChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LkFzc2lnbm1lbnRFeHByZXNzaW9uKCc9JyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbih0LnRoaXNFeHByZXNzaW9uKCksIHQuaWRlbnRpZmllcihrZXkpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2FsbEV4cHJlc3Npb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYXJyb3dGdW5jdGlvbkV4cHJlc3Npb24oW10sXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5ibG9ja1N0YXRlbWVudChwb3N0Q29uc3R1Y3RTZXR0ZXIpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgICAgICAgICAgICAgICApKTtcbiAgICB9XG4gICAgaWYoY29uc3R1Y3RvckJvZHkubGVuZ3RoKSB7XG4gICAgICBwcm9wZXJ0aWVzLnB1c2goY29uc3RydWN0b3IgfHwgdC5jbGFzc01ldGhvZCgnY29uc3RydWN0b3InLCB0LmlkZW50aWZpZXIoJ2NvbnN0cnVjdG9yJyksIFtdLCB0LmJsb2NrU3RhdGVtZW50KGNvbnN0dWN0b3JCb2R5KSkpO1xuICAgIH1cblxuICAgIGFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlKHBhdGgsIHN0YXRlKTtcblxuICAgIGlmKG1lbWJlckV4cHJlc3Npb24pIHtcbiAgICAgIGNsYXNzTmFtZSA9IG1lbWJlckV4cHJlc3Npb24ucHJvcGVydHkubmFtZTtcbiAgICB9XG5cbiAgICBsZXQgY2xhc3NEZWNsYXJhdGlvbiA9IHQuY2xhc3NEZWNsYXJhdGlvbih0LmlkZW50aWZpZXIoY2xhc3NOYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0Lm1lbWJlckV4cHJlc3Npb24odC5pZGVudGlmaWVyKCdwb2x5bWVyJyksIHQuaWRlbnRpZmllcignQmFzZScpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmNsYXNzQm9keShwcm9wZXJ0aWVzLmNvbmNhdChmdW5jdGlvbnMpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWNvcmF0b3JzKTtcblxuICAgIGlmKGJlaGF2aW9ycyAmJiAhc3RhdGUub3B0cy51c2VCZWhhdmlvckRlY29yYXRvcikge1xuICAgICAgY2xhc3NEZWNsYXJhdGlvbi5pbXBsZW1lbnRzID0gYmVoYXZpb3JzLm1hcCggKGJlaGF2aW9yKSA9PiB7XG4gICAgICAgIHJldHVybiB0LmNsYXNzSW1wbGVtZW50cyhiZWhhdmlvcik7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBpZihtZW1iZXJFeHByZXNzaW9uKSB7XG4vL1RPRE86IGV4cG9ydCBjbGFzcywgbW9kdWxlIG9uIHNhbWUgbGluZSBhcyBQb2x5bWVyXG4vLyAgICAgIGxldCBtb2R1bGUgPSB0LmRlY2xhcmVNb2R1bGUodC5pZGVudGlmaWVyKG1lbWJlckV4cHJlc3Npb24ub2JqZWN0Lm5hbWUpLFxuLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYmxvY2tTdGF0ZW1lbnQoW2NsYXNzRGVjbGFyYXRpb25dKSk7XG4gICAgICBsZXQgbW9kdWxlID0gdC5ibG9ja1N0YXRlbWVudChbY2xhc3NEZWNsYXJhdGlvbl0pO1xuXG4gICAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGhNdWx0aXBsZShbdC5pZGVudGlmaWVyKCdtb2R1bGUnKSwgdC5pZGVudGlmaWVyKCdQb2x5bWVyJyksIG1vZHVsZV0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGgoY2xhc3NEZWNsYXJhdGlvbik7XG5cbiAgICAgIHBhdGgucGFyZW50UGF0aC5pbnNlcnRBZnRlcih0LmV4cHJlc3Npb25TdGF0ZW1lbnQoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmNhbGxFeHByZXNzaW9uKFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0Lm1lbWJlckV4cHJlc3Npb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5pZGVudGlmaWVyKGNsYXNzTmFtZSksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5pZGVudGlmaWVyKCdyZWdpc3RlcicpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtdXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uKGZ1bmN0aW9uRXhwcmVzc2lvbikge1xuICAgIHZhciBuYW1lZFN0YXRlbWVudHMgPSB7fSxcbiAgICAgIHJlc3VsdDtcbi8vY29uc29sZS5pbmZvKCctLS0tLS0tLS0tLS0tJywgZnVuY3Rpb25FeHByZXNzaW9uKTtcblxuICAgIGZ1bmN0aW9uRXhwcmVzc2lvbi5ib2R5LmJvZHkuZm9yRWFjaCggKHN0YXRlbWVudCkgPT4ge1xuLy9jb25zb2xlLmluZm8oJyAgIC4uLicsIHN0YXRlbWVudCkgICAgICA7XG4gICAgICBpZiAodC5pc1JldHVyblN0YXRlbWVudChzdGF0ZW1lbnQpKSB7XG4gICAgICAgIHJlc3VsdCA9IHN0YXRlbWVudC5hcmd1bWVudDsgICAgICAgIFxuICAgICAgfSBlbHNlIGlmICh0LmlzRnVuY3Rpb25EZWNsYXJhdGlvbihzdGF0ZW1lbnQpKSB7XG4gICAgICAgIG5hbWVkU3RhdGVtZW50c1tzdGF0ZW1lbnQuaWQubmFtZV0gPSB0LmZ1bmN0aW9uRXhwcmVzc2lvbihudWxsLCBzdGF0ZW1lbnQucGFyYW1zLCBzdGF0ZW1lbnQuYm9keSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXN1bHQucHJvcGVydGllcy5mb3JFYWNoKCAocHJvcGVydHkpID0+IHtcbiAgICAgIGlmICh0LmlzSWRlbnRpZmllcihwcm9wZXJ0eS52YWx1ZSkpIHtcbiAgICAgICAgbGV0IHN0YXRlbWVudCA9IG5hbWVkU3RhdGVtZW50c1twcm9wZXJ0eS52YWx1ZS5uYW1lXTtcbiAgICAgICAgaWYgKHN0YXRlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgcHJvcGVydHkudmFsdWUgPSBzdGF0ZW1lbnQ7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIHZpc2l0b3I6IHtcbiAgICAgIENhbGxFeHByZXNzaW9uKHBhdGgsIHN0YXRlKSB7XG4gICAgICAgIG9ic2VydmVycyA9IHt9O1xuICAgICAgICBsaXN0ZW5lcnMgPSB7fTtcbiAgICAgICAgcG9zdENvbnN0dWN0U2V0dGVycyA9IHt9O1xuXG4vLyBjb25zb2xlLmluZm8oJzAwMDAwMDAwMDAwMDAgICcsIHBhdGgubm9kZS5jYWxsZWUubmFtZSk7XG4gICAgICAgIC8vIEZvciBzb21lIHJlYXNvbiB3ZSB2aXNpdCBlYWNoIGlkZW50aWZpZXIgdHdpY2VcbiAgICAgICAgaWYocGF0aC5ub2RlLmNhbGxlZS5zdGFydCAhPSBzdGFydCkge1xuICAgICAgICAgIHN0YXJ0ID0gcGF0aC5ub2RlLmNhbGxlZS5zdGFydDtcblxuICAgICAgICAgIGlmICghcGF0aC5ub2RlLmNhbGxlZS5uYW1lICYmIHQuaXNGdW5jdGlvbkV4cHJlc3Npb24ocGF0aC5ub2RlLmNhbGxlZSkpIHtcbiAgICAgICAgICAgIC8vIGFub255bW91cyBmdW5jdGlvbiAtIHdvbid0IGJlIGFibGUgdG8gZ2VuZXJhdGUgLmQudHNcbiAgICAgICAgICAgIHZhciBib2R5Tm9kZXMgPSBwYXRoLm5vZGUuY2FsbGVlLmJvZHkuYm9keTtcbiAgICAgICAgICAgIHBhdGgucmVwbGFjZVdpdGgoYm9keU5vZGVzWzBdKTtcbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAxOyBpIDwgYm9keU5vZGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICAgIHBhdGgucGFyZW50UGF0aC5pbnNlcnRBZnRlcihib2R5Tm9kZXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAocGF0aC5ub2RlLmNhbGxlZS5uYW1lID09ICdQb2x5bWVyJykge1xuICAgICAgICAgICAgbGV0IG1lbWJlckV4cHJlc3Npb24gPSB0LmlzQXNzaWdubWVudEV4cHJlc3Npb24ocGF0aC5wYXJlbnQpICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmlzTWVtYmVyRXhwcmVzc2lvbihwYXRoLnBhcmVudC5sZWZ0KSA/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXRoLnBhcmVudC5sZWZ0IDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIC8vbW9kdWxlID0gcGF0aC5wYXJlbnQubGVmdC5vYmplY3QubmFtZTtcbiAgICAgICAgICAgICAgICAvLyBwYXRoLnBhcmVudC5sZWZ0LnByb3BlcnR5Lm5hbWVcblxuICAgICAgICAgICAgcGFyc2VQb2x5bWVyQ2xhc3MocGF0aC5ub2RlLmFyZ3VtZW50c1swXSwgcGF0aCwgc3RhdGUsIG1lbWJlckV4cHJlc3Npb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcblxuICAgICAgQXNzaWdubWVudEV4cHJlc3Npb24ocGF0aCwgc3RhdGUpIHtcbi8vY29uc29sZS5pbmZvKCdzYWRmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmYnKTtcbiAgICAgICAgaWYodC5pc01lbWJlckV4cHJlc3Npb24ocGF0aC5ub2RlLmxlZnQpKSB7XG4vL2NvbnNvbGUuaW5mbygnMS4uLi4uLi4uLi4uLi4gcGF0aC5ub2RlOicsIHBhdGgubm9kZSk7XG4gICAgICAgICAgaWYocGF0aC5ub2RlLmxlZnQub2JqZWN0Lm5hbWUgPT0gJ1BvbHltZXInKSB7XG4gICAgICAgICAgICBsZXQgY2xhc3NOYW1lID0gcGF0aC5ub2RlLmxlZnQub2JqZWN0Lm5hbWUgKyAnLicgKyBwYXRoLm5vZGUubGVmdC5wcm9wZXJ0eS5uYW1lO1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdQYXJzaW5nIFBvbHltZXIgYmVoYXZpb3InLCBjbGFzc05hbWUsICdpbicsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4vL2NvbnNvbGUuaW5mbygnMi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4nLCBwYXRoLm5vZGUubGVmdCk7XG4vL2NvbnNvbGUuaW5mbygnMy4uLi4uLi4uLi4uLi4nLCBwYXRoLm5vZGUucmlnaHQudHlwZSk7XG4gICAgICAgICAgICBpZih0LmlzQ2FsbEV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0KSkge1xuY29uc29sZS5pbmZvKCcuLi4uLi4uLi4uIENhbGwgd2l0aGluIGFzc2lnbm1lbnQnLCBzdGF0ZS5maWxlLm9wdHMuZmlsZW5hbWUpO1xuICAgICAgICAgICAgICAvL2lmKHBhdGgubm9kZS5yaWdodC5jYWxsZWUubmFtZSA9PSAnUG9seW1lcicpIHtcbiAgICAgICAgICAgICAgLy8gIHBhcnNlUG9seW1lckNsYXNzKHBhdGgubm9kZS5yaWdodC5hcmd1bWVudHNbMF0sIHBhdGgsIHN0YXRlKTsgLy8sIHBhdGgubm9kZS5sZWZ0KTtcbiAgICAgICAgICAgICAgLy99IGVsc2UgaWYodC5pc0Z1bmN0aW9uRXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQuY2FsbGVlKSkge1xuICAgICAgICAgICAgICAvLyAgbGV0IGV4cHJlc3Npb24gPSBldmFsdWF0ZUZ1bmN0aW9uRXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQuY2FsbGVlKTtcbiAgICAgICAgICAgICAgLy8gIHBhcnNlUG9seW1lckNsYXNzKGV4cHJlc3Npb24sIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICAgIC8vfVxuICAgICAgICAgICAgfSBlbHNlIGlmKHQuaXNPYmplY3RFeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodCkpIHtcbiAgICAgICAgICAgICAgcGFyc2VQb2x5bWVyQ2xhc3MocGF0aC5ub2RlLnJpZ2h0LCBwYXRoLCBzdGF0ZSwgcGF0aC5ub2RlLmxlZnQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmKHQuaXNBcnJheUV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0KSkge1xuICAgICAgICAgICAgICBwYXJzZVBvbHltZXJCZWhhdmlvckRlZmluaXRpb24ocGF0aC5ub2RlLnJpZ2h0LCBwYXRoLCBzdGF0ZSwgcGF0aC5ub2RlLmxlZnQpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIGxvZ1BhdGgocGF0aCkge1xuICBmb3IodmFyIHByb3BOYW1lIGluIHBhdGgpIHtcbiAgICBpZihwYXRoLmhhc093blByb3BlcnR5KHByb3BOYW1lKVxuICAgICAgJiYgcHJvcE5hbWUgIT0gJ3BhcmVudFBhdGgnICYmIHByb3BOYW1lICE9ICdwYXJlbnQnXG4gICAgICAmJiBwcm9wTmFtZSAhPSAnaHViJ1xuICAgICAgJiYgcHJvcE5hbWUgIT0gJ2NvbnRhaW5lcicpIHtcbiAgICAgIGNvbnNvbGUubG9nKHByb3BOYW1lLCBwYXRoW3Byb3BOYW1lXSk7XG4gICAgfVxuICB9XG59XG4iXSwic291cmNlUm9vdCI6Ii9zb3VyY2UvIn0=
