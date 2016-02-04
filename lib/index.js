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
        if (params) {
            params.forEach(function (param) {
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
        if (property.leadingComments) {
            var match = property.leadingComments[0].value.match(/@type {(?!hydrolysis)([^}]+)}/);
            if (match) {
                type = createTypeAnnotation(match[1]);
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbInRvRGFzaENhc2UiLCJ0b1VwcGVyQ2FtZWwiLCJjcmVhdGVEZWNvcmF0b3IiLCJjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eSIsImNyZWF0ZVR5cGVBbm5vdGF0aW9uIiwicGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzIiwicGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMiLCJwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSIsInBhcnNlTm9uUG9seW1lckZ1bmN0aW9uIiwicGFyc2VQb2x5bWVyUHJvcGVydHkiLCJnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lIiwidmVyaWZ5UGF0aEV4aXN0cyIsImFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlIiwicGFyc2VQb2x5bWVyQmVoYXZpb3JEZWZpbml0aW9uIiwicGFyc2VQb2x5bWVyQ2xhc3MiLCJldmFsdWF0ZUZ1bmN0aW9uRXhwcmVzc2lvbiIsIkNhbGxFeHByZXNzaW9uIiwiQXNzaWdubWVudEV4cHJlc3Npb24iLCJsb2dQYXRoIl0sIm1hcHBpbmdzIjoiQUFBQSxrQ0FBa0M7QUFFbEMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7QUFFeEMsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFFMUIsbUJBQXdCLEVBQVk7UUFBSCxDQUFDO0lBQ2pDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUNULFNBQVMsR0FBRyxFQUFFLEVBQ2QsU0FBUyxHQUFHLEVBQUUsRUFDZCxtQkFBbUIsR0FBRyxFQUFFLENBQUM7SUFFN0Isb0JBQW9CLEdBQVc7UUFDN0JBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsRUFBRUEsVUFBU0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBRSxNQUFNLENBQUMsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMs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S0FDRixDQUFBO0FBQ0gsQ0FBQztBQWxrQkQ7MkJBa2tCQyxDQUFBO0FBRUQsaUJBQWlCLElBQUk7SUFDbkJDLEdBQUdBLENBQUFBLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLElBQUlBLElBQUlBLENBQUNBLENBQUNBLENBQUNBO1FBQ3pCQSxFQUFFQSxDQUFBQSxDQUFDQSxJQUFJQSxDQUFDQSxjQUFjQSxDQUFDQSxRQUFRQSxDQUFDQTtlQUMzQkEsUUFBUUEsSUFBSUEsWUFBWUEsSUFBSUEsUUFBUUEsSUFBSUEsUUFBUUE7ZUFDaERBLFFBQVFBLElBQUlBLEtBQUtBO2VBQ2pCQSxRQUFRQSxJQUFJQSxXQUFXQSxDQUFDQSxDQUFDQSxDQUFDQTtZQUM3QkEsT0FBT0EsQ0FBQ0EsR0FBR0EsQ0FBQ0EsUUFBUUEsRUFBRUEsSUFBSUEsQ0FBQ0EsUUFBUUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7UUFDeENBLENBQUNBO0lBQ0hBLENBQUNBO0FBQ0hBLENBQUNBIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiLy8vIDxyZWZlcmVuY2UgcGF0aD1cIm5vZGUuZC50c1wiIC8+XG5kZWNsYXJlIGZ1bmN0aW9uIHJlcXVpcmUobmFtZTogc3RyaW5nKTtcbnJlcXVpcmUoJ3NvdXJjZS1tYXAtc3VwcG9ydCcpLmluc3RhbGwoKTtcblxuaW1wb3J0IGZzID0gcmVxdWlyZSgnZnMnKTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oeyB0eXBlczogdCB9KSB7XG5cdHZhciBzdGFydCA9IC0xLFxuICAgICAgb2JzZXJ2ZXJzID0ge30sXG4gICAgICBsaXN0ZW5lcnMgPSB7fSxcbiAgICAgIHBvc3RDb25zdHVjdFNldHRlcnMgPSB7fTtcblxuICBmdW5jdGlvbiB0b0Rhc2hDYXNlKHN0cjogc3RyaW5nKXtcbiAgICByZXR1cm4gc3RyLnJlcGxhY2UoLyhbYS16XSspKFtBLVpdKS9nLCBmdW5jdGlvbigkMCwgJDEsICQyKXtyZXR1cm4gJDEgKyAnLScgKyAkMjt9KS50b0xvd2VyQ2FzZSgpO1xuICB9ICAgIFxuXG4gIGZ1bmN0aW9uIHRvVXBwZXJDYW1lbChzdHI6IHN0cmluZyl7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eW2Etel18KFxcLVthLXpdKS9nLCBmdW5jdGlvbigkMSl7cmV0dXJuICQxLnRvVXBwZXJDYXNlKCkucmVwbGFjZSgnLScsJycpO30pO1xuICB9XG5cbiAgZnVuY3Rpb24gY3JlYXRlRGVjb3JhdG9yKG5hbWU6IHN0cmluZywgdmFsdWUpIHtcbiAgICAgIHJldHVybiB0LmRlY29yYXRvcih0LmNhbGxFeHByZXNzaW9uKHQuaWRlbnRpZmllcihuYW1lKSxcbiAgICAgICAgICAgICAgW3R5cGVvZiB2YWx1ZSA9PSAnc3RyaW5nJyA/IHQuc3RyaW5nTGl0ZXJhbCh2YWx1ZSkgOiB2YWx1ZV0pKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG4vL2NvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0tLS0tLS0gY3JlYXRlRGVjb3JhdG9yUHJvcGVydHk6JywgdmFsdWUpICAgIDtcbi8vY29uc29sZS5pbmZvKCd0dHR0dHR0dHR0dHR0dHR0dCB0eXBlOicsIHR5cGVvZiB2YWx1ZSk7XG4gICAgc3dpdGNoKHR5cGVvZiB2YWx1ZSkge1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICByZXR1cm4gdC5vYmplY3RQcm9wZXJ0eShcbiAgICAgICAgdC5pZGVudGlmaWVyKGtleSksXG4gICAgICAgIHZhbHVlXG4gICAgICApO1xuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgdmFsdWUgPSB2YWx1ZS50b1N0cmluZygpO1xuICAgIH1cbiAgICByZXR1cm4gdC5vYmplY3RQcm9wZXJ0eShcbiAgICAgIHQuaWRlbnRpZmllcihrZXkpLFxuICAgICAgdC5pZGVudGlmaWVyKHZhbHVlKVxuICAgICk7XG4gIH1cblxuICAvKiogQHBhcmFtIHR5cGUgLSBvbmUgb2YgQm9vbGVhbiwgRGF0ZSwgTnVtYmVyLCBTdHJpbmcsIEFycmF5IG9yIE9iamVjdCAqL1xuICBmdW5jdGlvbiBjcmVhdGVUeXBlQW5ub3RhdGlvbih0eXBlOiBzdHJpbmcsIGVsZW1lbnRUeXBlID0gJ2FueScpIHtcbiAgICBzd2l0Y2godHlwZS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuc3RyaW5nVHlwZUFubm90YXRpb24oKSk7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICAvLyByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmJvb2xlYW5UeXBlQW5ub3RhdGlvbigpKTtcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuZ2VuZXJpY1R5cGVBbm5vdGF0aW9uKHQuaWRlbnRpZmllcignYm9vbGVhbicpKSk7XG4gICAgY2FzZSAnZGF0ZSc6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmRhdGVUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5udW1iZXJUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdhcnJheSc6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0LmFycmF5VHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKGVsZW1lbnRUeXBlKSkpO1xuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgZGVmYXVsdDpcbi8vY29uc29sZS5pbmZvKCdUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUdCB0eXBlOicsIHR5cGUpOyAgICBcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuZ2VuZXJpY1R5cGVBbm5vdGF0aW9uKHQuaWRlbnRpZmllcih0eXBlKSkpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lckZ1bmN0aW9uU2lnbmF0dXJlUHJvcGVydGllcyhlbGVtZW50cykge1xuICAgIHJldHVybiBlbGVtZW50cy5yZWR1Y2UoIChyZXN1bHRzLCBzaWduYXR1cmUpID0+IHtcbiAgICAgIC8vIGpvaW4gbXVsdGktbGluZSBzdHJpbmdzXG4gICAgICBsZXQgdmFsdWUgPSAnJztcbiAgICAgIHdoaWxlKHQuaXNCaW5hcnlFeHByZXNzaW9uKHNpZ25hdHVyZSkpIHtcbiAgICAgICAgLy8gdmFsdWUgPSAoKHNpZ25hdHVyZS5sZWZ0LnZhbHVlIHx8IHNpZ25hdHVyZS5sZWZ0LnJpZ2h0LnZhbHVlKSArIHNpZ25hdHVyZS5yaWdodC52YWx1ZTtcbiAgICAgICAgdmFsdWUgPSBzaWduYXR1cmUucmlnaHQudmFsdWUgKyB2YWx1ZTtcbiAgICAgICAgc2lnbmF0dXJlID0gc2lnbmF0dXJlLmxlZnQ7XG4gICAgICB9XG4gICAgICB2YWx1ZSA9IHNpZ25hdHVyZS52YWx1ZSArIHZhbHVlO1xuXG4gICAgICBsZXQgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvKFteXFwoXSspXFwoKFteXFwpXSspLyksXG4gICAgICAgIGZ1bmN0aW9uTmFtZSA9IG1hdGNoWzFdLFxuICAgICAgICBvYnNlcnZlZFByb3BlcnRpZXMgPSBtYXRjaFsyXTtcbiAgICAgIHJlc3VsdHNbZnVuY3Rpb25OYW1lXSA9IGNyZWF0ZURlY29yYXRvcignb2JzZXJ2ZScsIG9ic2VydmVkUHJvcGVydGllcyk7XG4gICAgICByZXR1cm4gcmVzdWx0cztcbiAgICB9LCB7fSk7XG4gIH1cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJFdmVudExpc3RlbmVyUHJvcGVydGllcyhwcm9wZXJ0aWVzKSB7XG4gICAgcmV0dXJuIHByb3BlcnRpZXMucmVkdWNlKCAocmVzdWx0cywgcHJvcGVydHkpID0+IHtcbiAgICAgIGxldCBldmVudE5hbWUgPSBwcm9wZXJ0eS5rZXkudmFsdWUgfHwgcHJvcGVydHkua2V5Lm5hbWUsXG4gICAgICAgICAgZnVuY3Rpb25OYW1lID0gcHJvcGVydHkudmFsdWUudmFsdWUsXG4gICAgICAgICAgZnVuY3Rpb25FdmVudHMgPSByZXN1bHRzW2Z1bmN0aW9uTmFtZV07XG4gICAgICBpZighZnVuY3Rpb25FdmVudHMpIHtcbiAgICAgICAgZnVuY3Rpb25FdmVudHMgPSByZXN1bHRzW2Z1bmN0aW9uTmFtZV0gPSBbXTtcbiAgICAgIH1cbiAgICAgIGZ1bmN0aW9uRXZlbnRzLnB1c2goY3JlYXRlRGVjb3JhdG9yKCdsaXN0ZW4nLCBldmVudE5hbWUpKTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0sIHt9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lckJlaGF2aW9yUmVmZXJlbmNlKHVzZUJlaGF2aW9yRGVjb3JhdG9yLCBub2RlKSB7XG4gICAgcmV0dXJuIHVzZUJlaGF2aW9yRGVjb3JhdG9yID8gY3JlYXRlRGVjb3JhdG9yKCdiZWhhdmlvcicsIG5vZGUpIDogbm9kZTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlTm9uUG9seW1lckZ1bmN0aW9uKG5vZGUpIHtcbiAgICBsZXQgbmFtZSA9IG5vZGUua2V5Lm5hbWUsXG4gICAgICBwYXJhbXMgPSBub2RlLnZhbHVlLnBhcmFtcyxcbiAgICAgIGJvZHkgLyo6IEFycmF5PFN0YXRlbWVudCAqLyA9IG5vZGUudmFsdWUuYm9keS5ib2R5O1xuXG4gICAgbGV0IG1ldGhvZCA9IHQuY2xhc3NNZXRob2QoJ21ldGhvZCcsIHQuaWRlbnRpZmllcihuYW1lKSwgcGFyYW1zLCB0LmJsb2NrU3RhdGVtZW50KGJvZHkpKTtcblxuICAgIC8vIEF0dGVtcHQgdG8gZ3Vlc3MgdGhlIHR5cGVzIGZyb20gcGFyYW1ldGVyIG5hbWVzXG4gICAgaWYgKHBhcmFtcykge1xuICAgICAgcGFyYW1zLmZvckVhY2goIChwYXJhbSkgPT4ge1xuICAgICAgICBsZXQgdHlwZSA9IG51bGw7XG5cbiAgICAgICAgcGFyYW0ub3B0aW9uYWwgPSAhIXBhcmFtLm5hbWUubWF0Y2goL15vcHQvKTtcblxuICAgICAgICBzd2l0Y2gocGFyYW0ubmFtZSkge1xuICAgICAgICBjYXNlICdlbCc6XG4gICAgICAgICAgdHlwZSA9ICdIVE1MRWxlbWVudCc7IGJyZWFrO1xuICAgICAgICBjYXNlICdldmVudCc6XG4gICAgICAgICAgdHlwZSA9ICdFdmVudCc7IGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGlmIChuYW1lLm1hdGNoKC9FbGVtZW50JC8pKSB7XG4gICAgICAgICAgICB0eXBlID0gJ0hUTUxFbGVtZW50JztcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZSkge1xuICAgICAgICAgIHBhcmFtLnR5cGVBbm5vdGF0aW9uID0gY3JlYXRlVHlwZUFubm90YXRpb24odHlwZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIFNvbWUgZnVuY3Rpb25zIGhhdmUgSlNEb2MgYW5ub3RhdGlvbnNcbiAgICAvLyBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS9jbG9zdXJlL2NvbXBpbGVyL2RvY3MvanMtZm9yLWNvbXBpbGVyI3R5cGVzXG4gICAgaWYgKG5vZGUubGVhZGluZ0NvbW1lbnRzKSB7XG4gICAgICBsZXQgdHlwZWRQYXJhbXMgPSBub2RlLmxlYWRpbmdDb21tZW50c1swXS52YWx1ZS5tYXRjaCgvQHBhcmFtIHtbXn1dK30gXFxTKy9nKTtcbiAgICAgIGlmICh0eXBlZFBhcmFtcykge1xuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHR5cGVkUGFyYW1zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgbGV0IHR5cGVkUGFyYW0gPSB0eXBlZFBhcmFtc1tpXSxcbiAgICAgICAgICAgICAgbWF0Y2ggPSB0eXBlZFBhcmFtLm1hdGNoKC97IT8oW149fV0rKSg9Pyl9IChcXFMrKS8pLFxuICAgICAgICAgICAgICB0eXBlID0gbWF0Y2hbMV0sXG4gICAgICAgICAgICAgIHBhcmFtID0gbWF0Y2hbM107XG5cbiAgICAgICAgICBpZiAoISFtYXRjaFsyXSkge1xuICAgICAgICAgICAgcGFyYW1zW2ldLm9wdGlvbmFsID0gdHJ1ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICAvLyByZW1vdmUgJ3VuZGVmaW5lZCdcbiAgICAgICAgICBtYXRjaCA9IHR5cGUubWF0Y2goLyguKltefF0pP1xcfD91bmRlZmluZWRcXHw/KC4qKS8pO1xuICAgICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgaWYgKG1hdGNoWzFdKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSBtYXRjaFsyXSA/IChtYXRjaFsxXSArICd8JyArIG1hdGNoWzJdKSA6IG1hdGNoWzFdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdHlwZSA9IG1hdGNoWzJdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChwYXJhbXNbaV0gJiYgcGFyYW1zW2ldLm5hbWUgPT0gcGFyYW0pIHtcbiAgICAgICAgICAgIHBhcmFtc1tpXS50eXBlQW5ub3RhdGlvbiA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKHR5cGUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oJ3BhcmFtJywgaSwgJygnICsgcGFyYW1zW2ldICsgJykgIT0nLCBwYXJhbSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIG1ldGhvZC5sZWFkaW5nQ29tbWVudHMgPSBub2RlLmxlYWRpbmdDb21tZW50cztcbiAgICB9XG5cbiAgICByZXR1cm4gbWV0aG9kO1xuICB9XG5cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJQcm9wZXJ0eShwcm9wZXJ0eSkgLyo6IENsYXNzUHJvcGVydHkgKi8ge1xuLy9jb25zb2xlLmluZm8oJyMjIyMjIyMjIyMjIyMgcGFyc2VQb2x5bWVyUHJvcGVydHk6JywgcHJvcGVydHkpICAgIDtcbiAgICBsZXQgbmFtZTogc3RyaW5nID0gcHJvcGVydHkua2V5Lm5hbWUsXG4gICAgICAgIGF0dHJpYnV0ZXMgPSBwcm9wZXJ0eS52YWx1ZS5wcm9wZXJ0aWVzLFxuICAgICAgICB0eXBlLCB2YWx1ZSwgaXNGdW5jdGlvbiwgcGFyYW1zLCByZWFkb25seSA9IGZhbHNlLCBkZWNvcmF0b3JQcm9wcyA9IFtdO1xuXG4gICAgaWYodC5pc0lkZW50aWZpZXIocHJvcGVydHkudmFsdWUpKSB7XG4gICAgICB0eXBlID0gY3JlYXRlVHlwZUFubm90YXRpb24ocHJvcGVydHkudmFsdWUubmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF0dHJpYnV0ZXMuZm9yRWFjaCggKGF0dHJpYnV0ZSkgPT4ge1xuLy9jb25zb2xlLmluZm8oJyAgICYmJiYmJiYmJiYmJiYmJiYgYXR0cmlidXRlOicsIGF0dHJpYnV0ZSkgICAgICAgIDtcbiAgICAgICAgbGV0IGF0dHJfbmFtZTogc3RyaW5nID0gYXR0cmlidXRlLmtleS5uYW1lO1xuICAgICAgICBzd2l0Y2goYXR0cl9uYW1lKSB7XG4gICAgICAgIGNhc2UgJ3R5cGUnOlxuICAgICAgICAgIC8vIG9uZSBvZiBCb29sZWFuLCBEYXRlLCBOdW1iZXIsIFN0cmluZywgQXJyYXkgb3IgT2JqZWN0XG4gICAgICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKGF0dHJpYnV0ZS52YWx1ZS5uYW1lKTtcbi8vL2NvbnNvbGUuaW5mbygnLT4+Pj4+Pj4+Pj4+Pj4gaW5mZXJyZWQgdHlwZTonLCB0eXBlKTsgICAgICAgICAgXG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZS5uYW1lKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3ZhbHVlJzpcbiAgICAgICAgICAvLyBEZWZhdWx0IHZhbHVlIGZvciB0aGUgcHJvcGVydHlcbiAgICAgICAgICB2YWx1ZSA9IGF0dHJpYnV0ZS52YWx1ZTtcbi8vY29uc29sZS5pbmZvKCctPj4+Pj4+Pj4+Pj4+Pj4+PiBpbmZlcnJlZCB2YWx1ZTonLCB2YWx1ZSk7ICAgICAgICAgIFxuICAgICAgICAgIC8vZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZSkpO1xuICAgICAgICAgIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICBpc0Z1bmN0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHBhcmFtcyA9IFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZih0eXBlID09PSB1bmRlZmluZWQgJiYgIXQuaXNOdWxsTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIGlmICh0LmlzQ2FsbEV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIC8vIFRPRE86IGRldGVybWluZSBhY3R1YWwgdHlwZVxuICAgICAgICAgICAgICB0eXBlID0gdC50eXBlQW5ub3RhdGlvbih0LmdlbmVyaWNUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoJ29iamVjdCcpKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIHR5cGUgPSB0LnR5cGVBbm5vdGF0aW9uKHQuZnVuY3Rpb25UeXBlQW5ub3RhdGlvbigpKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHR5cGUgPSB0LmNyZWF0ZVR5cGVBbm5vdGF0aW9uQmFzZWRPblR5cGVvZih2YWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdyZWFkT25seSc6XG4gICAgICAgICAgcmVhZG9ubHkgPSB0cnVlO1xuICAgICAgICAgIC8vIGZhbGwtdGhyb3VnaFxuICAgICAgICBjYXNlICdyZWZsZWN0VG9BdHRyaWJ1dGUnOlxuICAgICAgICBjYXNlICdub3RpZnknOlxuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCBhdHRyaWJ1dGUudmFsdWUudmFsdWUpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAnY29tcHV0ZWQnOlxuICAgICAgICBjYXNlICdvYnNlcnZlcic6XG4gICAgICAgICAgLy8gY29tcHV0ZWQgZnVuY3Rpb24gY2FsbCAoYXMgc3RyaW5nKVxuLy8gY29uc29sZS5pbmZvKCc9PT09PT09PT09PScsIGF0dHJpYnV0ZS52YWx1ZSkgICAgICAgICAgO1xuICAgICAgICAgIGRlY29yYXRvclByb3BzLnB1c2goY3JlYXRlRGVjb3JhdG9yUHJvcGVydHkoYXR0cl9uYW1lLCAnXFwnJyArIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSArICdcXCcnKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgY29uc29sZS53YXJuKCdVbmV4cGVjdGVkIHByb3BlcnR5IGF0dHJpYnV0ZTogJywgYXR0cmlidXRlLmtleS5uYW1lLCAnYXQgbGluZScsIGF0dHJpYnV0ZS5sb2Muc3RhcnQubGluZSk7XG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSkpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBsZXQgZGVjb3JhdG9ycyA9IFt0LmRlY29yYXRvcihcbiAgICAgICAgICB0LmNhbGxFeHByZXNzaW9uKFxuICAgICAgICAgICAgdC5pZGVudGlmaWVyKCdwcm9wZXJ0eScpLFxuICAgICAgICAgICAgW3Qub2JqZWN0RXhwcmVzc2lvbihkZWNvcmF0b3JQcm9wcyldXG4gICAgICAgICAgKVxuICAgICAgICApXTtcblxuICAgIGlmIChwcm9wZXJ0eS5sZWFkaW5nQ29tbWVudHMpIHtcbiAgICAgIGxldCBtYXRjaCA9IHByb3BlcnR5LmxlYWRpbmdDb21tZW50c1swXS52YWx1ZS5tYXRjaCgvQHR5cGUgeyg/IWh5ZHJvbHlzaXMpKFtefV0rKX0vKTtcbiAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICB0eXBlID0gY3JlYXRlVHlwZUFubm90YXRpb24obWF0Y2hbMV0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmKGlzRnVuY3Rpb24pIHtcbiAgICAgIHBvc3RDb25zdHVjdFNldHRlcnNbbmFtZV0gPSB2YWx1ZS5ib2R5LmJvZHk7XG4gICAgICB2YXIgcmVzdWx0ID0gdC5jbGFzc1Byb3BlcnR5KHQuaWRlbnRpZmllcihuYW1lKSwgdW5kZWZpbmVkLCB0eXBlLCBkZWNvcmF0b3JzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdmFyIHJlc3VsdCA9IHQuY2xhc3NQcm9wZXJ0eSh0LmlkZW50aWZpZXIobmFtZSksIHZhbHVlLCB0eXBlLCBkZWNvcmF0b3JzKTtcbiAgICB9XG5cbiAgICByZXN1bHQubGVhZGluZ0NvbW1lbnRzID0gcHJvcGVydHkubGVhZGluZ0NvbW1lbnRzO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH1cblxuICB2YXIgcG9seW1lclBhdGhzQnlGaWxlTmFtZSA9IHtcbiAgICAnaXJvbi1idXR0b24tc3RhdGUnOiAnaXJvbi1iZWhhdmlvcnMnLFxuICAgICdpcm9uLWNvbnRyb2wtc3RhdGUnOiAnaXJvbi1iZWhhdmlvcnMnLFxuICAgICdpcm9uLW1lbnUtYmVoYXZpb3InOiAnaXJvbi1tZW51LWJlaGF2aW9yJyxcbiAgICAnaXJvbi1tZW51YmFyLWJlaGF2aW9yJzogJ2lyb24tbWVudS1iZWhhdmlvcicsXG4gICAgJ2lyb24tbXVsdGktc2VsZWN0YWJsZS1iZWhhdmlvcic6ICdpcm9uLXNlbGVjdG9yJyxcbiAgICAnaXJvbi1zZWxlY3RhYmxlJzogJ2lyb24tc2VsZWN0b3InLFxuICAgICdpcm9uLXNlbGVjdGlvbic6ICdpcm9uLXNlbGVjdG9yJyxcbiAgICAncGFwZXItYnV0dG9uLWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ3BhcGVyLWNoZWNrZWQtZWxlbWVudC1iZWhhdmlvcic6ICdwYXBlci1iZWhhdmlvcnMnLFxuICAgICdwYXBlci1pbmt5LWZvY3VzLWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ3BhcGVyLXJpcHBsZS1iZWhhdmlvcic6ICdwYXBlci1iZWhhdmlvcnMnXG4gIH07XG4gIGZ1bmN0aW9uIGdldFBhdGhGb3JQb2x5bWVyRmlsZU5hbWUoZmlsZVBhdGg6IHN0cmluZywgZHRzRmlsZU5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgZHRzRmlsZU5hbWUgPSBkdHNGaWxlTmFtZS5yZXBsYWNlKC8taW1wbCQvLCAnJyk7XG4gICAgdmFyIHBhdGggPSBwb2x5bWVyUGF0aHNCeUZpbGVOYW1lW2R0c0ZpbGVOYW1lXTtcbi8vY29uc29sZS5pbmZvKCcuLi4uLi4uLi4uLi4uLi4uLi4uLmxvb2tpbmcgZm9yICcgKyBkdHNGaWxlTmFtZSwgJ2luJywgZmlsZVBhdGgpO1xuXG4gICAgaWYoIXBhdGgpIHtcbi8vY29uc29sZS5pbmZvKCcxMTExMTExMTExMTExMTExMTExMSAnLCBmaWxlUGF0aCArICcuLi4nICsgZHRzRmlsZU5hbWUgKyAnLycgKyBkdHNGaWxlTmFtZSArICcuaHRtbCcpOyAgICAgIFxuICAgICAgaWYodmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCArIGR0c0ZpbGVOYW1lICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmh0bWwnKSkge1xuICAgICAgICByZXR1cm4gZHRzRmlsZU5hbWU7XG4gICAgICB9XG4gICAgICBwYXRoID0gZHRzRmlsZU5hbWUubWF0Y2goL1teLV0rLVteLV0rLylbMF07XG4vL2NvbnNvbGUuaW5mbygnMjIyMjIyMjIyMjIyMjIyMjIyMjIgJywgZmlsZVBhdGggKyAnLi4uJyArIHBhdGggKyAnLycgKyBkdHNGaWxlTmFtZSArICcuaHRtbCcpOyAgICAgIFxuICAgICAgaWYodmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCArIHBhdGggKyAnLycgKyBkdHNGaWxlTmFtZSArICcuaHRtbCcpKSB7XG4gICAgICAgIHJldHVybiBwYXRoO1xuICAgICAgfVxuXG5jb25zb2xlLmluZm8oJyEhISEhISEhISEhISEhISEhISEhISEhISEgZmFpbGVkIHRvIGZpbmQgcGF0aCBmb3InLCBkdHNGaWxlTmFtZSk7ICAgICAgXG4gICAgfVxuXG4gICAgcmV0dXJuIHBhdGg7XG4gIH1cblxuICBmdW5jdGlvbiB2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoKTogYm9vbGVhbiB7XG4gICAgdHJ5IHtcbiAgICAgIGlmKGZzLmFjY2Vzc1N5bmMpIHtcbiAgICAgICAgZnMuYWNjZXNzU3luYyhmaWxlUGF0aCwgZnMuRl9PSyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmcy5sc3RhdFN5bmMoZmlsZVBhdGgpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIGFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlKHBhdGgsIHN0YXRlLCBkdHNGaWxlTmFtZT86IHN0cmluZykge1xuICAgIC8vIEZpbmQgdGhlIGZpbGUncyByZWxhdGl2ZSBwYXRoIHRvIGJvd2VyX2NvbXBvbmVudHNcbiAgICB2YXIgZmlsZVBhdGggPSBzdGF0ZS5maWxlLm9wdHMuZmlsZW5hbWUsIGRvdHMgPSAnJztcbiAgICB3aGlsZShmaWxlUGF0aCkge1xuICAgICAgZmlsZVBhdGggPSBmaWxlUGF0aC5tYXRjaCgvKC4qKVxcLy4qLyk7XG4gICAgICBmaWxlUGF0aCA9IGZpbGVQYXRoICYmIGZpbGVQYXRoWzFdO1xuICAgICAgaWYoZmlsZVBhdGgpIHtcbiAgICAgICAgaWYodmVyaWZ5UGF0aEV4aXN0cyhmaWxlUGF0aCArICcvYm93ZXJfY29tcG9uZW50cycpKSB7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgZG90cyArPSAnLi4vJztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFdyaXRlIG91dCB0aGUgVHlwZVNjcmlwdCBjb2RlXG4gICAgaWYoZHRzRmlsZU5hbWUpIHtcbiAgICAgIGxldCBkdHNQYXRoID0gZ2V0UGF0aEZvclBvbHltZXJGaWxlTmFtZShmaWxlUGF0aCArICcvYm93ZXJfY29tcG9uZW50cy8nLCBkdHNGaWxlTmFtZSk7XG4gICAgICBzdGF0ZS5maWxlLnBhdGguYWRkQ29tbWVudCgnbGVhZGluZycsICcvIDxyZWZlcmVuY2UgcGF0aD1cIicgKyBkb3RzICsgJ3R5cGluZ3MvJyArIGR0c1BhdGggKyAnLycgKyBkdHNGaWxlTmFtZSArICcuZC50c1wiLz4nLCB0cnVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhdGUuZmlsZS5wYXRoLmFkZENvbW1lbnQoJ2xlYWRpbmcnLCAnLyA8cmVmZXJlbmNlIHBhdGg9XCInICsgZG90cyArICdib3dlcl9jb21wb25lbnRzL3BvbHltZXItdHMvcG9seW1lci10cy5kLnRzXCIvPicsIHRydWUpO1xuICAgIH1cbiAgfVxuXG4vKlxuVE9ETzogXG4tIG5lZWQgdG8gZXhwb3J0IGJlaGF2aW9yIGNsYXNzZXNcbi0gLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL2Jvd2VyX2NvbXBvbmVudHMvLi4uLi5cbiovXG4gIC8qKlxuICAgIFRIZSBpbXBsZW1lbnRhdGlvbiBvZiB0aGlzIHByb2JhYmx5IGlzbid0IHNwb3Qgb24sIGZvciBub3cgSSBqdXN0IHdhbnQgdG8gZXh0cmFjdCBlbm91Z2ggdG8gZ2VuZXJhdGUgLmQudHMgZmlsZXNcbiAgICBmb3IgdGhlIFBvbHltZXIgTWF0ZXJpYWwgY29tcG9uZW50cy5cbiAgICAqL1xuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJCZWhhdmlvckRlZmluaXRpb24oYXJyYXlFeHByZXNzaW9uLCBwYXRoLCBzdGF0ZSwgbWVtYmVyRXhwcmVzc2lvbikge1xuICAgIGxldCBjbGFzc0RlY2xhcmF0aW9uID0gdC5jbGFzc0RlY2xhcmF0aW9uKHQuaWRlbnRpZmllcihtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5jbGFzc0JvZHkoW10pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtdKTtcbi8vY29uc29sZS5pbmZvKCctLS0tLS0tLS0tLScsIGFycmF5RXhwcmVzc2lvbikgICAgICA7XG4gICAgY2xhc3NEZWNsYXJhdGlvbi5pbXBsZW1lbnRzID0gYXJyYXlFeHByZXNzaW9uLmVsZW1lbnRzLm1hcCggKGJlaGF2aW9yKSA9PiB7XG4vL2NvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0nLCBiZWhhdmlvci5wcm9wZXJ0eS5uYW1lLCBtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUpICAgICAgO1xuICAgICAgaWYoYmVoYXZpb3IucHJvcGVydHkubmFtZSAhPSBtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUgKyAnSW1wbCcpIHtcbiAgICAgICAgYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUsIHRvRGFzaENhc2UoYmVoYXZpb3IucHJvcGVydHkubmFtZSkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHQuY2xhc3NJbXBsZW1lbnRzKGJlaGF2aW9yLnByb3BlcnR5KTtcbiAgICB9KTtcbiAgICAvL2NsYXNzRGVjbGFyYXRpb24ubW9kaWZpZXJzID0gW3QuYWJzcmFjdF1cbiAgICBcbiAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGgodC5kZWNsYXJlTW9kdWxlKHQuaWRlbnRpZmllcihtZW1iZXJFeHByZXNzaW9uLm9iamVjdC5uYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYmxvY2tTdGF0ZW1lbnQoW2NsYXNzRGVjbGFyYXRpb25dKSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQ2xhc3Mob2JqZWN0RXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIG1lbWJlckV4cHJlc3Npb24/KSB7XG4vL2NvbnNvbGUuaW5mbygnPT09PT09PT09PT09PT09PT09PT09PT09PT09b2JqZWN0RXhwcmVzc2lvbjonLCBvYmplY3RFeHByZXNzaW9uKTsgICAgXG4vL2NvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tbWVtYmVyRXhwcmVzc2lvbjonLCBtZW1iZXJFeHByZXNzaW9uKTtcbiAgICBsZXQgY2xhc3NOYW1lLCBlbGVtZW50TmFtZSxcbiAgICAgICAgICAgICAgICBleHRlbmQsIGJlaGF2aW9ycywgaG9zdEF0dHJpYnV0ZXMsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllcyAvKjogQXJyYXk8Q2xhc3NQcm9wZXJ0eT4gKi8gPSBbXSxcbiAgICAgICAgICAgICAgICBjb25zdHJ1Y3RvcixcbiAgICAgICAgICAgICAgICBmdW5jdGlvbnMgLyo6IEFycmF5PENsYXNzTWV0aG9kPiovID0gW107XG5cbiAgICBvYmplY3RFeHByZXNzaW9uLnByb3BlcnRpZXMuZm9yRWFjaCggKGNvbmZpZykgPT4ge1xuIC8vIGNvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0tLS0tLS0tJywgY29uZmlnKTtcbiAgICAgIHN3aXRjaChjb25maWcua2V5Lm5hbWUpIHtcbiAgICAgIGNhc2UgJ2lzJzpcbiAgICAgICAgZWxlbWVudE5hbWUgPSBjb25maWcudmFsdWUudmFsdWU7XG4gICAgICAgIGNsYXNzTmFtZSA9IHRvVXBwZXJDYW1lbChjb25maWcudmFsdWUudmFsdWUpO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1BhcnNpbmcgUG9seW1lciBlbGVtZW50JywgZWxlbWVudE5hbWUsICdpbicsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXh0ZW5kcyc6XG4gICAgICAgIGV4dGVuZCA9IGNvbmZpZy52YWx1ZS52YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdiZWhhdmlvcnMnOlxuICAgICAgICBiZWhhdmlvcnMgPSBjb25maWcudmFsdWUuZWxlbWVudHMubWFwKHBhcnNlUG9seW1lckJlaGF2aW9yUmVmZXJlbmNlLmJpbmQodW5kZWZpbmVkLCBzdGF0ZS5vcHRzLnVzZUJlaGF2aW9yRGVjb3JhdG9yKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncHJvcGVydGllcyc6XG4gICAgICAgIHByb3BlcnRpZXMgPSBjb25maWcudmFsdWUucHJvcGVydGllcy5tYXAocGFyc2VQb2x5bWVyUHJvcGVydHkpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2hvc3RBdHRyaWJ1dGVzJzpcbiAgICAgICAgaG9zdEF0dHJpYnV0ZXMgPSBjb25maWcudmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb2JzZXJ2ZXJzJzpcbiAgICAgICAgb2JzZXJ2ZXJzID0gcGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzKGNvbmZpZy52YWx1ZS5lbGVtZW50cyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbGlzdGVuZXJzJzpcbiAgICAgICAgbGlzdGVuZXJzID0gcGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMoY29uZmlnLnZhbHVlLnByb3BlcnRpZXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmKHQuaXNPYmplY3RNZXRob2QoY29uZmlnKSkge1xuICAgICAgICAgIGZ1bmN0aW9ucy5wdXNoKHQuY2xhc3NNZXRob2QoY29uZmlnLmtpbmQsIGNvbmZpZy5rZXksIGNvbmZpZy5wYXJhbXMsIGNvbmZpZy5ib2R5LCBjb25maWcuY29tcHV0ZWQsIGNvbmZpZy5zdGF0aWMpKTtcbiAgICAgICAgfSBlbHNlIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24oY29uZmlnLnZhbHVlKSkge1xuICAgICAgICAgIGxldCBtZXRob2QgPSBwYXJzZU5vblBvbHltZXJGdW5jdGlvbihjb25maWcpO1xuXG4gICAgICAgICAgaWYobWV0aG9kLmtleS5uYW1lID09ICdmYWN0b3J5SW1wbCcpIHtcbiAgICAgICAgICAgIG1ldGhvZC5rZXkubmFtZSA9IG1ldGhvZC5raW5kID0gJ2NvbnN0cnVjdG9yJztcbiAgICAgICAgICAgIGNvbnN0cnVjdG9yID0gbWV0aG9kO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBBZGQgb2JzZXJ2ZXIgZGVjb3JhdG9yc1xuICAgICAgICAgICAgbGV0IGZ1bmN0aW9uT2JzZXJ2ZXIgPSBvYnNlcnZlcnNbbWV0aG9kLmtleS5uYW1lXTtcbiAgICAgICAgICAgIGlmKGZ1bmN0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgaWYoIW1ldGhvZC5kZWNvcmF0b3JzKSB7IG1ldGhvZC5kZWNvcmF0b3JzID0gW107IH1cbiAgICAgICAgICAgICAgICBtZXRob2QuZGVjb3JhdG9ycy5wdXNoKGZ1bmN0aW9uT2JzZXJ2ZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgbGlzdGVuZXIgZGVjb3JhdG9yc1xuICAgICAgICAgICAgbGV0IGZ1bmN0aW9uTGlzdGVuZXJzID0gbGlzdGVuZXJzW21ldGhvZC5rZXkubmFtZV07XG4gICAgICAgICAgICBpZihmdW5jdGlvbkxpc3RlbmVycykge1xuICAgICAgICAgICAgICBmdW5jdGlvbkxpc3RlbmVycy5mb3JFYWNoKCAobGlzdGVuZXIpID0+IHtcbiAgICAgICAgICAgICAgICBpZighbWV0aG9kLmRlY29yYXRvcnMpIHsgbWV0aG9kLmRlY29yYXRvcnMgPSBbXTsgfVxuICAgICAgICAgICAgICAgIG1ldGhvZC5kZWNvcmF0b3JzLnB1c2gobGlzdGVuZXIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9ucy5wdXNoKG1ldGhvZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHQuaXNPYmplY3RFeHByZXNzaW9uKSB7XG4gICAgICAgICAgcHJvcGVydGllcy5wdXNoKHQuY2xhc3NQcm9wZXJ0eSh0LmlkZW50aWZpZXIoY29uZmlnLmtleS5uYW1lKSwgY29uZmlnLnZhbHVlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFwiISEhISEhISEhISEgVW5leHBlY3RlZCBwcm9wZXJ0eTpcIiwgY29uZmlnLmtleSArICc6JywgY29uZmlnLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgbGV0IGRlY29yYXRvcnMgPSBbXVxuICAgIGlmKGVsZW1lbnROYW1lKSB7XG4gICAgICBkZWNvcmF0b3JzLnB1c2goY3JlYXRlRGVjb3JhdG9yKCdjb21wb25lbnQnLCBlbGVtZW50TmFtZSkpO1xuICAgICAgaWYoZXh0ZW5kKSB7XG4gICAgICAgIGRlY29yYXRvcnMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2V4dGVuZCcsIGV4dGVuZCkpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZihob3N0QXR0cmlidXRlcykge1xuICAgICAgZGVjb3JhdG9ycy5wdXNoKGNyZWF0ZURlY29yYXRvcignaG9zdEF0dHJpYnV0ZXMnLCBob3N0QXR0cmlidXRlcykpO1xuICAgIH1cbiAgICBpZihiZWhhdmlvcnMgJiYgc3RhdGUub3B0cy51c2VCZWhhdmlvckRlY29yYXRvcikge1xuICAgICAgZGVjb3JhdG9ycyA9IGRlY29yYXRvcnMuY29uY2F0KGJlaGF2aW9ycyk7XG4gICAgfVxuXG4gICAgLy8gQWRkIGFueSBwb3N0Q29uc3RydWN0b3JTZXR0ZXJzIChQb2x5bWVyIHByb3BlcnRpZXMgd2l0aCBhIGZ1bmN0aW9uIGZvciBgdmFsdWVgKVxuICAgIGxldCBjb25zdHVjdG9yQm9keSAvKjogQXJyYXk8U3RhdGVtZW50PiovID0gY29uc3RydWN0b3IgPyBjb25zdHJ1Y3Rvci5ib2R5LmJvZHkgOiBbXTtcblxuICAgIGZvcih2YXIga2V5IGluIHBvc3RDb25zdHVjdFNldHRlcnMpIHtcbiAgICAgIGxldCBwb3N0Q29uc3R1Y3RTZXR0ZXIgLyo6IEJsb2NrU3RhdGVtZW50IHwgRXhwcmVzc2lvbiAqLyA9IHBvc3RDb25zdHVjdFNldHRlcnNba2V5XTtcbiAgICAgIGNvbnN0dWN0b3JCb2R5LnB1c2godC5leHByZXNzaW9uU3RhdGVtZW50KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuQXNzaWdubWVudEV4cHJlc3Npb24oJz0nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5tZW1iZXJFeHByZXNzaW9uKHQudGhpc0V4cHJlc3Npb24oKSwgdC5pZGVudGlmaWVyKGtleSkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5jYWxsRXhwcmVzc2lvbihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5hcnJvd0Z1bmN0aW9uRXhwcmVzc2lvbihbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmJsb2NrU3RhdGVtZW50KHBvc3RDb25zdHVjdFNldHRlcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuICAgIH1cbiAgICBpZihjb25zdHVjdG9yQm9keS5sZW5ndGgpIHtcbiAgICAgIHByb3BlcnRpZXMucHVzaChjb25zdHJ1Y3RvciB8fCB0LmNsYXNzTWV0aG9kKCdjb25zdHJ1Y3RvcicsIHQuaWRlbnRpZmllcignY29uc3RydWN0b3InKSwgW10sIHQuYmxvY2tTdGF0ZW1lbnQoY29uc3R1Y3RvckJvZHkpKSk7XG4gICAgfVxuXG4gICAgYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUpO1xuXG4gICAgaWYobWVtYmVyRXhwcmVzc2lvbikge1xuICAgICAgY2xhc3NOYW1lID0gbWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lO1xuICAgIH1cblxuICAgIGxldCBjbGFzc0RlY2xhcmF0aW9uID0gdC5jbGFzc0RlY2xhcmF0aW9uKHQuaWRlbnRpZmllcihjbGFzc05hbWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbih0LmlkZW50aWZpZXIoJ3BvbHltZXInKSwgdC5pZGVudGlmaWVyKCdCYXNlJykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2xhc3NCb2R5KHByb3BlcnRpZXMuY29uY2F0KGZ1bmN0aW9ucykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlY29yYXRvcnMpO1xuXG4gICAgaWYoYmVoYXZpb3JzICYmICFzdGF0ZS5vcHRzLnVzZUJlaGF2aW9yRGVjb3JhdG9yKSB7XG4gICAgICBjbGFzc0RlY2xhcmF0aW9uLmltcGxlbWVudHMgPSBiZWhhdmlvcnMubWFwKCAoYmVoYXZpb3IpID0+IHtcbiAgICAgICAgcmV0dXJuIHQuY2xhc3NJbXBsZW1lbnRzKGJlaGF2aW9yKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmKG1lbWJlckV4cHJlc3Npb24pIHtcbi8vVE9ETzogZXhwb3J0IGNsYXNzLCBtb2R1bGUgb24gc2FtZSBsaW5lIGFzIFBvbHltZXJcbi8vICAgICAgbGV0IG1vZHVsZSA9IHQuZGVjbGFyZU1vZHVsZSh0LmlkZW50aWZpZXIobWVtYmVyRXhwcmVzc2lvbi5vYmplY3QubmFtZSksXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5ibG9ja1N0YXRlbWVudChbY2xhc3NEZWNsYXJhdGlvbl0pKTtcbiAgICAgIGxldCBtb2R1bGUgPSB0LmJsb2NrU3RhdGVtZW50KFtjbGFzc0RlY2xhcmF0aW9uXSk7XG5cbiAgICAgIHBhdGgucGFyZW50UGF0aC5yZXBsYWNlV2l0aE11bHRpcGxlKFt0LmlkZW50aWZpZXIoJ21vZHVsZScpLCB0LmlkZW50aWZpZXIoJ1BvbHltZXInKSwgbW9kdWxlXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGgucGFyZW50UGF0aC5yZXBsYWNlV2l0aChjbGFzc0RlY2xhcmF0aW9uKTtcblxuICAgICAgcGF0aC5wYXJlbnRQYXRoLmluc2VydEFmdGVyKHQuZXhwcmVzc2lvblN0YXRlbWVudChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2FsbEV4cHJlc3Npb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmlkZW50aWZpZXIoY2xhc3NOYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmlkZW50aWZpZXIoJ3JlZ2lzdGVyJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZXZhbHVhdGVGdW5jdGlvbkV4cHJlc3Npb24oZnVuY3Rpb25FeHByZXNzaW9uKSB7XG4gICAgdmFyIG5hbWVkU3RhdGVtZW50cyA9IHt9LFxuICAgICAgcmVzdWx0O1xuLy9jb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tLS0nLCBmdW5jdGlvbkV4cHJlc3Npb24pO1xuXG4gICAgZnVuY3Rpb25FeHByZXNzaW9uLmJvZHkuYm9keS5mb3JFYWNoKCAoc3RhdGVtZW50KSA9PiB7XG4vL2NvbnNvbGUuaW5mbygnICAgLi4uJywgc3RhdGVtZW50KSAgICAgIDtcbiAgICAgIGlmICh0LmlzUmV0dXJuU3RhdGVtZW50KHN0YXRlbWVudCkpIHtcbiAgICAgICAgcmVzdWx0ID0gc3RhdGVtZW50LmFyZ3VtZW50OyAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKHN0YXRlbWVudCkpIHtcbiAgICAgICAgbmFtZWRTdGF0ZW1lbnRzW3N0YXRlbWVudC5pZC5uYW1lXSA9IHQuZnVuY3Rpb25FeHByZXNzaW9uKG51bGwsIHN0YXRlbWVudC5wYXJhbXMsIHN0YXRlbWVudC5ib2R5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJlc3VsdC5wcm9wZXJ0aWVzLmZvckVhY2goIChwcm9wZXJ0eSkgPT4ge1xuICAgICAgaWYgKHQuaXNJZGVudGlmaWVyKHByb3BlcnR5LnZhbHVlKSkge1xuICAgICAgICBsZXQgc3RhdGVtZW50ID0gbmFtZWRTdGF0ZW1lbnRzW3Byb3BlcnR5LnZhbHVlLm5hbWVdO1xuICAgICAgICBpZiAoc3RhdGVtZW50ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwcm9wZXJ0eS52YWx1ZSA9IHN0YXRlbWVudDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdmlzaXRvcjoge1xuICAgICAgQ2FsbEV4cHJlc3Npb24ocGF0aCwgc3RhdGUpIHtcbiAgICAgICAgb2JzZXJ2ZXJzID0ge307XG4gICAgICAgIGxpc3RlbmVycyA9IHt9O1xuICAgICAgICBwb3N0Q29uc3R1Y3RTZXR0ZXJzID0ge307XG5cbi8vIGNvbnNvbGUuaW5mbygnMDAwMDAwMDAwMDAwMCAgJywgcGF0aC5ub2RlLmNhbGxlZS5uYW1lKTtcbiAgICAgICAgLy8gRm9yIHNvbWUgcmVhc29uIHdlIHZpc2l0IGVhY2ggaWRlbnRpZmllciB0d2ljZVxuICAgICAgICBpZihwYXRoLm5vZGUuY2FsbGVlLnN0YXJ0ICE9IHN0YXJ0KSB7XG4gICAgICAgICAgc3RhcnQgPSBwYXRoLm5vZGUuY2FsbGVlLnN0YXJ0O1xuXG4gICAgICAgICAgaWYgKCFwYXRoLm5vZGUuY2FsbGVlLm5hbWUgJiYgdC5pc0Z1bmN0aW9uRXhwcmVzc2lvbihwYXRoLm5vZGUuY2FsbGVlKSkge1xuICAgICAgICAgICAgLy8gYW5vbnltb3VzIGZ1bmN0aW9uIC0gd29uJ3QgYmUgYWJsZSB0byBnZW5lcmF0ZSAuZC50c1xuICAgICAgICAgICAgdmFyIGJvZHlOb2RlcyA9IHBhdGgubm9kZS5jYWxsZWUuYm9keS5ib2R5O1xuICAgICAgICAgICAgcGF0aC5yZXBsYWNlV2l0aChib2R5Tm9kZXNbMF0pO1xuICAgICAgICAgICAgZm9yIChsZXQgaSA9IDE7IGkgPCBib2R5Tm9kZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgcGF0aC5wYXJlbnRQYXRoLmluc2VydEFmdGVyKGJvZHlOb2Rlc1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmIChwYXRoLm5vZGUuY2FsbGVlLm5hbWUgPT0gJ1BvbHltZXInKSB7XG4gICAgICAgICAgICBsZXQgbWVtYmVyRXhwcmVzc2lvbiA9IHQuaXNBc3NpZ25tZW50RXhwcmVzc2lvbihwYXRoLnBhcmVudCkgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuaXNNZW1iZXJFeHByZXNzaW9uKHBhdGgucGFyZW50LmxlZnQpID9cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBhdGgucGFyZW50LmxlZnQgOiB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgLy9tb2R1bGUgPSBwYXRoLnBhcmVudC5sZWZ0Lm9iamVjdC5uYW1lO1xuICAgICAgICAgICAgICAgIC8vIHBhdGgucGFyZW50LmxlZnQucHJvcGVydHkubmFtZVxuXG4gICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhwYXRoLm5vZGUuYXJndW1lbnRzWzBdLCBwYXRoLCBzdGF0ZSwgbWVtYmVyRXhwcmVzc2lvbik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9LFxuXG4gICAgICBBc3NpZ25tZW50RXhwcmVzc2lvbihwYXRoLCBzdGF0ZSkge1xuLy9jb25zb2xlLmluZm8oJ3NhZGZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZicpO1xuICAgICAgICBpZih0LmlzTWVtYmVyRXhwcmVzc2lvbihwYXRoLm5vZGUubGVmdCkpIHtcbi8vY29uc29sZS5pbmZvKCcxLi4uLi4uLi4uLi4uLiBwYXRoLm5vZGU6JywgcGF0aC5ub2RlKTtcbiAgICAgICAgICBpZihwYXRoLm5vZGUubGVmdC5vYmplY3QubmFtZSA9PSAnUG9seW1lcicpIHtcbiAgICAgICAgICAgIGxldCBjbGFzc05hbWUgPSBwYXRoLm5vZGUubGVmdC5vYmplY3QubmFtZSArICcuJyArIHBhdGgubm9kZS5sZWZ0LnByb3BlcnR5Lm5hbWU7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1BhcnNpbmcgUG9seW1lciBiZWhhdmlvcicsIGNsYXNzTmFtZSwgJ2luJywgc3RhdGUuZmlsZS5vcHRzLmZpbGVuYW1lKTtcbi8vY29uc29sZS5pbmZvKCcyLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLicsIHBhdGgubm9kZS5sZWZ0KTtcbi8vY29uc29sZS5pbmZvKCczLi4uLi4uLi4uLi4uLicsIHBhdGgubm9kZS5yaWdodC50eXBlKTtcbiAgICAgICAgICAgIGlmKHQuaXNDYWxsRXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG5jb25zb2xlLmluZm8oJy4uLi4uLi4uLi4gQ2FsbCB3aXRoaW4gYXNzaWdubWVudCcsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4gICAgICAgICAgICAgIC8vaWYocGF0aC5ub2RlLnJpZ2h0LmNhbGxlZS5uYW1lID09ICdQb2x5bWVyJykge1xuICAgICAgICAgICAgICAvLyAgcGFyc2VQb2x5bWVyQ2xhc3MocGF0aC5ub2RlLnJpZ2h0LmFyZ3VtZW50c1swXSwgcGF0aCwgc3RhdGUpOyAvLywgcGF0aC5ub2RlLmxlZnQpO1xuICAgICAgICAgICAgICAvL30gZWxzZSBpZih0LmlzRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpKSB7XG4gICAgICAgICAgICAgIC8vICBsZXQgZXhwcmVzc2lvbiA9IGV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpO1xuICAgICAgICAgICAgICAvLyAgcGFyc2VQb2x5bWVyQ2xhc3MoZXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIHBhdGgubm9kZS5sZWZ0KTtcbiAgICAgICAgICAgICAgLy99XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc09iamVjdEV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0KSkge1xuICAgICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc0FycmF5RXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG4gICAgICAgICAgICAgIHBhcnNlUG9seW1lckJlaGF2aW9yRGVmaW5pdGlvbihwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nUGF0aChwYXRoKSB7XG4gIGZvcih2YXIgcHJvcE5hbWUgaW4gcGF0aCkge1xuICAgIGlmKHBhdGguaGFzT3duUHJvcGVydHkocHJvcE5hbWUpXG4gICAgICAmJiBwcm9wTmFtZSAhPSAncGFyZW50UGF0aCcgJiYgcHJvcE5hbWUgIT0gJ3BhcmVudCdcbiAgICAgICYmIHByb3BOYW1lICE9ICdodWInXG4gICAgICAmJiBwcm9wTmFtZSAhPSAnY29udGFpbmVyJykge1xuICAgICAgY29uc29sZS5sb2cocHJvcE5hbWUsIHBhdGhbcHJvcE5hbWVdKTtcbiAgICB9XG4gIH1cbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
