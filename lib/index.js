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
        switch (type) {
            case 'String':
                return t.typeAnnotation(t.stringTypeAnnotation());
            case 'Boolean':
                // return t.typeAnnotation(t.booleanTypeAnnotation());
                return t.typeAnnotation(t.genericTypeAnnotation(t.identifier('boolean')));
            case 'Date':
                return t.typeAnnotation(t.dateTypeAnnotation());
            case 'Number':
                return t.typeAnnotation(t.numberTypeAnnotation());
            case 'Array':
                return t.typeAnnotation(t.arrayTypeAnnotation(t.identifier(elementType)));
            case 'Object':
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
        method.leadingComments = node.leadingComments;
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
                                // TODO: determine actual type
                                //console.info('...it is a function!');              
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
            path.parentPath.parentPath.addComment('leading', '/ <reference path="' + dots + 'typings/' + dtsPath + '/' + dtsFileName + '.d.ts"/>', true);
        }
        else {
            path.parentPath.parentPath.addComment('leading', '/ <reference path="' + dots + 'bower_components/polymer-ts/polymer-ts.d.ts"/>', true);
        }
    }
    /*
    TODO:
    - need to export behavior classes
    - declare behavior as abstract
    - IntelliJ is happier if TSD declares multiple inheritance rather than `implements`
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
                    if (path.node.callee.name == 'Polymer') {
                        parsePolymerClass(path.node.arguments[0], path, state);
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
                            if (path.node.right.callee.name == 'Polymer') {
                                parsePolymerClass(path.node.right.arguments[0], path, state); //, path.node.left);
                            }
                            else if (t.isFunctionExpression(path.node.right.callee)) {
                                var expression = evaluateFunctionExpression(path.node.right.callee);
                                parsePolymerClass(expression, path, state, path.node.left);
                            }
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

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbImluZGV4LnRzIl0sIm5hbWVzIjpbInRvRGFzaENhc2UiLCJ0b1VwcGVyQ2FtZWwiLCJjcmVhdGVEZWNvcmF0b3IiLCJjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eSIsImNyZWF0ZVR5cGVBbm5vdGF0aW9uIiwicGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzIiwicGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMiLCJwYXJzZVBvbHltZXJCZWhhdmlvclJlZmVyZW5jZSIsInBhcnNlTm9uUG9seW1lckZ1bmN0aW9uIiwicGFyc2VQb2x5bWVyUHJvcGVydHkiLCJnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lIiwidmVyaWZ5UGF0aEV4aXN0cyIsImFkZFR5cGVEZWZpbml0aW9uUmVmZXJlbmNlIiwicGFyc2VQb2x5bWVyQmVoYXZpb3JEZWZpbml0aW9uIiwicGFyc2VQb2x5bWVyQ2xhc3MiLCJldmFsdWF0ZUZ1bmN0aW9uRXhwcmVzc2lvbiIsIkNhbGxFeHByZXNzaW9uIiwiQXNzaWdubWVudEV4cHJlc3Npb24iLCJsb2dQYXRoIl0sIm1hcHBpbmdzIjoiQUFBQSxrQ0FBa0M7QUFFbEMsT0FBTyxDQUFDLG9CQUFvQixDQUFDLENBQUMsT0FBTyxFQUFFLENBQUM7QUFFeEMsSUFBTyxFQUFFLFdBQVcsSUFBSSxDQUFDLENBQUM7QUFFMUIsbUJBQXdCLEVBQVk7UUFBSCxDQUFDO0lBQ2pDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxFQUNULFNBQVMsR0FBRyxFQUFFLEVBQ2QsU0FBUyxHQUFHLEVBQUUsRUFDZCxtQkFBbUIsR0FBRyxFQUFFLENBQUM7SUFFN0Isb0JBQW9CLEdBQVc7UUFDN0JBLE1BQU1BLENBQUNBLEdBQUdBLENBQUNBLE9BQU9BLENBQUNBLGtCQUFrQkEsRUFBRUEsVUFBU0EsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsRUFBRUEsSUFBRSxNQUFNLENBQUMsRUFBRSxHQUFHLEdBQUcsR0FBRyxFQUFFLENBQUMs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LEdBQUdBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLElBQUlBLENBQUNBO3dCQUNoRkEsT0FBT0EsQ0FBQ0EsSUFBSUEsQ0FBQ0EsMEJBQTBCQSxFQUFFQSxTQUFTQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxRQUFRQSxDQUFDQSxDQUFDQTt3QkFDaEdBLHNFQUFzRUE7d0JBQ3RFQSx1REFBdURBO3dCQUMzQ0EsRUFBRUEsQ0FBQUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsZ0JBQWdCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDdkNBLEVBQUVBLENBQUFBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLElBQUlBLElBQUlBLFNBQVNBLENBQUNBLENBQUNBLENBQUNBO2dDQUM1Q0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxTQUFTQSxDQUFDQSxDQUFDQSxDQUFDQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxvQkFBb0JBOzRCQUNwRkEsQ0FBQ0E7NEJBQUNBLElBQUlBLENBQUNBLEVBQUVBLENBQUFBLENBQUNBLENBQUNBLENBQUNBLG9CQUFvQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsQ0FBQ0EsTUFBTUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7Z0NBQ3pEQSxJQUFJQSxVQUFVQSxHQUFHQSwwQkFBMEJBLENBQUNBLElBQUlBLENBQUNBLElBQUlBLENBQUNBLEtBQUtBLENBQUNBLE1BQU1BLENBQUNBLENBQUNBO2dDQUNwRUEsaUJBQWlCQSxDQUFDQSxVQUFVQSxFQUFFQSxJQUFJQSxFQUFFQSxLQUFLQSxFQUFFQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxDQUFDQTs0QkFDN0RBLENBQUNBO3dCQUNIQSxDQUFDQTt3QkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0Esa0JBQWtCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDaERBLGlCQUFpQkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7d0JBQ2xFQSxDQUFDQTt3QkFBQ0EsSUFBSUEsQ0FBQ0EsRUFBRUEsQ0FBQUEsQ0FBQ0EsQ0FBQ0EsQ0FBQ0EsaUJBQWlCQSxDQUFDQSxJQUFJQSxDQUFDQSxJQUFJQSxDQUFDQSxLQUFLQSxDQUFDQSxDQUFDQSxDQUFDQSxDQUFDQTs0QkFDL0NBLDhCQUE4QkEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsS0FBS0EsRUFBRUEsSUFBSUEsRUFBRUEsS0FBS0EsRUFBRUEsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsQ0FBQ0E7d0JBQy9FQSxDQUFDQTtvQkFFSEEsQ0FBQ0E7Z0JBQ0hBLENBQUNBO1lBQ0hBLENBQUNBO1NBQ0Y7S0FDRixDQUFBO0FBQ0gsQ0FBQztBQW5mRDsyQkFtZkMsQ0FBQTtBQUVELGlCQUFpQixJQUFJO0lBQ25CQyxHQUFHQSxDQUFBQSxDQUFDQSxHQUFHQSxDQUFDQSxRQUFRQSxJQUFJQSxJQUFJQSxDQUFDQSxDQUFDQSxDQUFDQTtRQUN6QkEsRUFBRUEsQ0FBQUEsQ0FBQ0EsSUFBSUEsQ0FBQ0EsY0FBY0EsQ0FBQ0EsUUFBUUEsQ0FBQ0E7ZUFDM0JBLFFBQVFBLElBQUlBLFlBQVlBLElBQUlBLFFBQVFBLElBQUlBLFFBQVFBO2VBQ2hEQSxRQUFRQSxJQUFJQSxLQUFLQTtlQUNqQkEsUUFBUUEsSUFBSUEsV0FBV0EsQ0FBQ0EsQ0FBQ0EsQ0FBQ0E7WUFDN0JBLE9BQU9BLENBQUNBLEdBQUdBLENBQUNBLFFBQVFBLEVBQUVBLElBQUlBLENBQUNBLFFBQVFBLENBQUNBLENBQUNBLENBQUNBO1FBQ3hDQSxDQUFDQTtJQUNIQSxDQUFDQTtBQUNIQSxDQUFDQSIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8vLyA8cmVmZXJlbmNlIHBhdGg9XCJub2RlLmQudHNcIiAvPlxuZGVjbGFyZSBmdW5jdGlvbiByZXF1aXJlKG5hbWU6IHN0cmluZyk7XG5yZXF1aXJlKCdzb3VyY2UtbWFwLXN1cHBvcnQnKS5pbnN0YWxsKCk7XG5cbmltcG9ydCBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uKHsgdHlwZXM6IHQgfSkge1xuXHR2YXIgc3RhcnQgPSAtMSxcbiAgICAgIG9ic2VydmVycyA9IHt9LFxuICAgICAgbGlzdGVuZXJzID0ge30sXG4gICAgICBwb3N0Q29uc3R1Y3RTZXR0ZXJzID0ge307XG5cbiAgZnVuY3Rpb24gdG9EYXNoQ2FzZShzdHI6IHN0cmluZyl7XG4gICAgcmV0dXJuIHN0ci5yZXBsYWNlKC8oW2Etel0rKShbQS1aXSkvZywgZnVuY3Rpb24oJDAsICQxLCAkMil7cmV0dXJuICQxICsgJy0nICsgJDI7fSkudG9Mb3dlckNhc2UoKTtcbiAgfSAgICBcblxuICBmdW5jdGlvbiB0b1VwcGVyQ2FtZWwoc3RyOiBzdHJpbmcpe1xuICAgIHJldHVybiBzdHIucmVwbGFjZSgvXlthLXpdfChcXC1bYS16XSkvZywgZnVuY3Rpb24oJDEpe3JldHVybiAkMS50b1VwcGVyQ2FzZSgpLnJlcGxhY2UoJy0nLCcnKTt9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIGNyZWF0ZURlY29yYXRvcihuYW1lOiBzdHJpbmcsIHZhbHVlKSB7XG4gICAgICByZXR1cm4gdC5kZWNvcmF0b3IodC5jYWxsRXhwcmVzc2lvbih0LmlkZW50aWZpZXIobmFtZSksXG4gICAgICAgICAgICAgIFt0eXBlb2YgdmFsdWUgPT0gJ3N0cmluZycgPyB0LnN0cmluZ0xpdGVyYWwodmFsdWUpIDogdmFsdWVdKSk7XG4gIH1cblxuICBmdW5jdGlvbiBjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZykge1xuLy9jb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tLS0tLS0tIGNyZWF0ZURlY29yYXRvclByb3BlcnR5OicsIHZhbHVlKSAgICA7XG4vL2NvbnNvbGUuaW5mbygndHR0dHR0dHR0dHR0dHR0dHQgdHlwZTonLCB0eXBlb2YgdmFsdWUpO1xuICAgIHN3aXRjaCh0eXBlb2YgdmFsdWUpIHtcbiAgICBjYXNlICdvYmplY3QnOlxuICAgICAgcmV0dXJuIHQub2JqZWN0UHJvcGVydHkoXG4gICAgICAgIHQuaWRlbnRpZmllcihrZXkpLFxuICAgICAgICB2YWx1ZVxuICAgICAgKTtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHZhbHVlID0gdmFsdWUudG9TdHJpbmcoKTtcbiAgICB9XG4gICAgcmV0dXJuIHQub2JqZWN0UHJvcGVydHkoXG4gICAgICB0LmlkZW50aWZpZXIoa2V5KSxcbiAgICAgIHQuaWRlbnRpZmllcih2YWx1ZSlcbiAgICApO1xuICB9XG5cbiAgLyoqIEBwYXJhbSB0eXBlIC0gb25lIG9mIEJvb2xlYW4sIERhdGUsIE51bWJlciwgU3RyaW5nLCBBcnJheSBvciBPYmplY3QgKi9cbiAgZnVuY3Rpb24gY3JlYXRlVHlwZUFubm90YXRpb24odHlwZTogc3RyaW5nLCBlbGVtZW50VHlwZSA9ICdhbnknKSB7XG4gICAgc3dpdGNoKHR5cGUpIHtcbiAgICBjYXNlICdTdHJpbmcnOlxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5zdHJpbmdUeXBlQW5ub3RhdGlvbigpKTtcbiAgICBjYXNlICdCb29sZWFuJzpcbiAgICAgIC8vIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuYm9vbGVhblR5cGVBbm5vdGF0aW9uKCkpO1xuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5nZW5lcmljVHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKCdib29sZWFuJykpKTtcbiAgICBjYXNlICdEYXRlJzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuZGF0ZVR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ051bWJlcic6XG4gICAgICByZXR1cm4gdC50eXBlQW5ub3RhdGlvbih0Lm51bWJlclR5cGVBbm5vdGF0aW9uKCkpO1xuICAgIGNhc2UgJ0FycmF5JzpcbiAgICAgIHJldHVybiB0LnR5cGVBbm5vdGF0aW9uKHQuYXJyYXlUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoZWxlbWVudFR5cGUpKSk7XG4gICAgY2FzZSAnT2JqZWN0JzpcbiAgICBkZWZhdWx0OlxuLy9jb25zb2xlLmluZm8oJ1RUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFR0IHR5cGU6JywgdHlwZSk7ICAgIFxuICAgICAgcmV0dXJuIHQudHlwZUFubm90YXRpb24odC5nZW5lcmljVHlwZUFubm90YXRpb24odC5pZGVudGlmaWVyKHR5cGUpKSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzKGVsZW1lbnRzKSB7XG4gICAgcmV0dXJuIGVsZW1lbnRzLnJlZHVjZSggKHJlc3VsdHMsIHNpZ25hdHVyZSkgPT4ge1xuICAgICAgLy8gam9pbiBtdWx0aS1saW5lIHN0cmluZ3NcbiAgICAgIGxldCB2YWx1ZSA9ICcnO1xuICAgICAgd2hpbGUodC5pc0JpbmFyeUV4cHJlc3Npb24oc2lnbmF0dXJlKSkge1xuICAgICAgICAvLyB2YWx1ZSA9ICgoc2lnbmF0dXJlLmxlZnQudmFsdWUgfHwgc2lnbmF0dXJlLmxlZnQucmlnaHQudmFsdWUpICsgc2lnbmF0dXJlLnJpZ2h0LnZhbHVlO1xuICAgICAgICB2YWx1ZSA9IHNpZ25hdHVyZS5yaWdodC52YWx1ZSArIHZhbHVlO1xuICAgICAgICBzaWduYXR1cmUgPSBzaWduYXR1cmUubGVmdDtcbiAgICAgIH1cbiAgICAgIHZhbHVlID0gc2lnbmF0dXJlLnZhbHVlICsgdmFsdWU7XG5cbiAgICAgIGxldCBtYXRjaCA9IHZhbHVlLm1hdGNoKC8oW15cXChdKylcXCgoW15cXCldKykvKSxcbiAgICAgICAgZnVuY3Rpb25OYW1lID0gbWF0Y2hbMV0sXG4gICAgICAgIG9ic2VydmVkUHJvcGVydGllcyA9IG1hdGNoWzJdO1xuICAgICAgcmVzdWx0c1tmdW5jdGlvbk5hbWVdID0gY3JlYXRlRGVjb3JhdG9yKCdvYnNlcnZlJywgb2JzZXJ2ZWRQcm9wZXJ0aWVzKTtcbiAgICAgIHJldHVybiByZXN1bHRzO1xuICAgIH0sIHt9KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHBhcnNlUG9seW1lckV2ZW50TGlzdGVuZXJQcm9wZXJ0aWVzKHByb3BlcnRpZXMpIHtcbiAgICByZXR1cm4gcHJvcGVydGllcy5yZWR1Y2UoIChyZXN1bHRzLCBwcm9wZXJ0eSkgPT4ge1xuICAgICAgbGV0IGV2ZW50TmFtZSA9IHByb3BlcnR5LmtleS52YWx1ZSB8fCBwcm9wZXJ0eS5rZXkubmFtZSxcbiAgICAgICAgICBmdW5jdGlvbk5hbWUgPSBwcm9wZXJ0eS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBmdW5jdGlvbkV2ZW50cyA9IHJlc3VsdHNbZnVuY3Rpb25OYW1lXTtcbiAgICAgIGlmKCFmdW5jdGlvbkV2ZW50cykge1xuICAgICAgICBmdW5jdGlvbkV2ZW50cyA9IHJlc3VsdHNbZnVuY3Rpb25OYW1lXSA9IFtdO1xuICAgICAgfVxuICAgICAgZnVuY3Rpb25FdmVudHMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2xpc3RlbicsIGV2ZW50TmFtZSkpO1xuICAgICAgcmV0dXJuIHJlc3VsdHM7XG4gICAgfSwge30pO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQmVoYXZpb3JSZWZlcmVuY2UodXNlQmVoYXZpb3JEZWNvcmF0b3IsIG5vZGUpIHtcbiAgICByZXR1cm4gdXNlQmVoYXZpb3JEZWNvcmF0b3IgPyBjcmVhdGVEZWNvcmF0b3IoJ2JlaGF2aW9yJywgbm9kZSkgOiBub2RlO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VOb25Qb2x5bWVyRnVuY3Rpb24obm9kZSkge1xuICAgIGxldCBuYW1lID0gbm9kZS5rZXkubmFtZSxcbiAgICAgIHBhcmFtcyA9IG5vZGUudmFsdWUucGFyYW1zLFxuICAgICAgYm9keSAvKjogQXJyYXk8U3RhdGVtZW50ICovID0gbm9kZS52YWx1ZS5ib2R5LmJvZHk7XG5cbiAgICBsZXQgbWV0aG9kID0gdC5jbGFzc01ldGhvZCgnbWV0aG9kJywgdC5pZGVudGlmaWVyKG5hbWUpLCBwYXJhbXMsIHQuYmxvY2tTdGF0ZW1lbnQoYm9keSkpO1xuICAgIG1ldGhvZC5sZWFkaW5nQ29tbWVudHMgPSBub2RlLmxlYWRpbmdDb21tZW50cztcbiAgICByZXR1cm4gbWV0aG9kO1xuICB9XG5cblxuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJQcm9wZXJ0eShwcm9wZXJ0eSkgLyo6IENsYXNzUHJvcGVydHkgKi8ge1xuLy9jb25zb2xlLmluZm8oJyMjIyMjIyMjIyMjIyMgcGFyc2VQb2x5bWVyUHJvcGVydHk6JywgcHJvcGVydHkpICAgIDtcbiAgICBsZXQgbmFtZTogc3RyaW5nID0gcHJvcGVydHkua2V5Lm5hbWUsXG4gICAgICAgIGF0dHJpYnV0ZXMgPSBwcm9wZXJ0eS52YWx1ZS5wcm9wZXJ0aWVzLFxuICAgICAgICB0eXBlLCB2YWx1ZSwgaXNGdW5jdGlvbiwgcGFyYW1zLCByZWFkb25seSA9IGZhbHNlLCBkZWNvcmF0b3JQcm9wcyA9IFtdO1xuXG4gICAgaWYodC5pc0lkZW50aWZpZXIocHJvcGVydHkudmFsdWUpKSB7XG4gICAgICB0eXBlID0gY3JlYXRlVHlwZUFubm90YXRpb24ocHJvcGVydHkudmFsdWUubmFtZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF0dHJpYnV0ZXMuZm9yRWFjaCggKGF0dHJpYnV0ZSkgPT4ge1xuLy9jb25zb2xlLmluZm8oJyAgICYmJiYmJiYmJiYmJiYmJiYgYXR0cmlidXRlOicsIGF0dHJpYnV0ZSkgICAgICAgIDtcbiAgICAgICAgbGV0IGF0dHJfbmFtZTogc3RyaW5nID0gYXR0cmlidXRlLmtleS5uYW1lO1xuICAgICAgICBzd2l0Y2goYXR0cl9uYW1lKSB7XG4gICAgICAgIGNhc2UgJ3R5cGUnOlxuICAgICAgICAgIC8vIG9uZSBvZiBCb29sZWFuLCBEYXRlLCBOdW1iZXIsIFN0cmluZywgQXJyYXkgb3IgT2JqZWN0XG4gICAgICAgICAgdHlwZSA9IGNyZWF0ZVR5cGVBbm5vdGF0aW9uKGF0dHJpYnV0ZS52YWx1ZS5uYW1lKTtcbi8vL2NvbnNvbGUuaW5mbygnLT4+Pj4+Pj4+Pj4+Pj4gaW5mZXJyZWQgdHlwZTonLCB0eXBlKTsgICAgICAgICAgXG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZS5uYW1lKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3ZhbHVlJzpcbiAgICAgICAgICAvLyBEZWZhdWx0IHZhbHVlIGZvciB0aGUgcHJvcGVydHlcbiAgICAgICAgICB2YWx1ZSA9IGF0dHJpYnV0ZS52YWx1ZTtcbi8vY29uc29sZS5pbmZvKCctPj4+Pj4+Pj4+Pj4+Pj4+PiBpbmZlcnJlZCB2YWx1ZTonLCB2YWx1ZSk7ICAgICAgICAgIFxuICAgICAgICAgIC8vZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZSkpO1xuICAgICAgICAgIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICBpc0Z1bmN0aW9uID0gdHJ1ZTtcbiAgICAgICAgICAgIHBhcmFtcyA9IFtdO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZih0eXBlID09PSB1bmRlZmluZWQgJiYgIXQuaXNOdWxsTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgICAgICAgIGlmICh0LmlzQ2FsbEV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIC8vIFRPRE86IGRldGVybWluZSBhY3R1YWwgdHlwZVxuICAgICAgICAgICAgICB0eXBlID0gdC50eXBlQW5ub3RhdGlvbih0LmdlbmVyaWNUeXBlQW5ub3RhdGlvbih0LmlkZW50aWZpZXIoJ29iamVjdCcpKSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24odmFsdWUpKSB7XG4gICAgICAgICAgICAgIC8vIFRPRE86IGRldGVybWluZSBhY3R1YWwgdHlwZVxuLy9jb25zb2xlLmluZm8oJy4uLml0IGlzIGEgZnVuY3Rpb24hJyk7ICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgdHlwZSA9IHQudHlwZUFubm90YXRpb24odC5mdW5jdGlvblR5cGVBbm5vdGF0aW9uKCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgdHlwZSA9IHQuY3JlYXRlVHlwZUFubm90YXRpb25CYXNlZE9uVHlwZW9mKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgJ3JlYWRPbmx5JzpcbiAgICAgICAgICByZWFkb25seSA9IHRydWU7XG4gICAgICAgICAgLy8gZmFsbC10aHJvdWdoXG4gICAgICAgIGNhc2UgJ3JlZmxlY3RUb0F0dHJpYnV0ZSc6XG4gICAgICAgIGNhc2UgJ25vdGlmeSc6XG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsIGF0dHJpYnV0ZS52YWx1ZS52YWx1ZSkpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlICdjb21wdXRlZCc6XG4gICAgICAgIGNhc2UgJ29ic2VydmVyJzpcbiAgICAgICAgICAvLyBjb21wdXRlZCBmdW5jdGlvbiBjYWxsIChhcyBzdHJpbmcpXG4vLyBjb25zb2xlLmluZm8oJz09PT09PT09PT09JywgYXR0cmlidXRlLnZhbHVlKSAgICAgICAgICA7XG4gICAgICAgICAgZGVjb3JhdG9yUHJvcHMucHVzaChjcmVhdGVEZWNvcmF0b3JQcm9wZXJ0eShhdHRyX25hbWUsICdcXCcnICsgYXR0cmlidXRlLnZhbHVlLnZhbHVlICsgJ1xcJycpKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICBjb25zb2xlLndhcm4oJ1VuZXhwZWN0ZWQgcHJvcGVydHkgYXR0cmlidXRlOiAnLCBhdHRyaWJ1dGUua2V5Lm5hbWUsICdhdCBsaW5lJywgYXR0cmlidXRlLmxvYy5zdGFydC5saW5lKTtcbiAgICAgICAgICBkZWNvcmF0b3JQcm9wcy5wdXNoKGNyZWF0ZURlY29yYXRvclByb3BlcnR5KGF0dHJfbmFtZSwgYXR0cmlidXRlLnZhbHVlLnZhbHVlKSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGxldCBkZWNvcmF0b3JzID0gW3QuZGVjb3JhdG9yKFxuICAgICAgICAgIHQuY2FsbEV4cHJlc3Npb24oXG4gICAgICAgICAgICB0LmlkZW50aWZpZXIoJ3Byb3BlcnR5JyksXG4gICAgICAgICAgICBbdC5vYmplY3RFeHByZXNzaW9uKGRlY29yYXRvclByb3BzKV1cbiAgICAgICAgICApXG4gICAgICAgICldO1xuXG4gICAgaWYoaXNGdW5jdGlvbikge1xuICAgICAgcG9zdENvbnN0dWN0U2V0dGVyc1tuYW1lXSA9IHZhbHVlLmJvZHkuYm9keTtcbiAgICAgIHZhciByZXN1bHQgPSB0LmNsYXNzUHJvcGVydHkodC5pZGVudGlmaWVyKG5hbWUpLCB1bmRlZmluZWQsIHR5cGUsIGRlY29yYXRvcnMpO1xuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgcmVzdWx0ID0gdC5jbGFzc1Byb3BlcnR5KHQuaWRlbnRpZmllcihuYW1lKSwgdmFsdWUsIHR5cGUsIGRlY29yYXRvcnMpO1xuICAgIH1cblxuICAgIHJlc3VsdC5sZWFkaW5nQ29tbWVudHMgPSBwcm9wZXJ0eS5sZWFkaW5nQ29tbWVudHM7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHZhciBwb2x5bWVyUGF0aHNCeUZpbGVOYW1lID0ge1xuICAgICdpcm9uLWJ1dHRvbi1zdGF0ZSc6ICdpcm9uLWJlaGF2aW9ycycsXG4gICAgJ2lyb24tY29udHJvbC1zdGF0ZSc6ICdpcm9uLWJlaGF2aW9ycycsXG4gICAgJ2lyb24tbWVudS1iZWhhdmlvcic6ICdpcm9uLW1lbnUtYmVoYXZpb3InLFxuICAgICdpcm9uLW1lbnViYXItYmVoYXZpb3InOiAnaXJvbi1tZW51LWJlaGF2aW9yJyxcbiAgICAnaXJvbi1tdWx0aS1zZWxlY3RhYmxlLWJlaGF2aW9yJzogJ2lyb24tc2VsZWN0b3InLFxuICAgICdpcm9uLXNlbGVjdGFibGUnOiAnaXJvbi1zZWxlY3RvcicsXG4gICAgJ2lyb24tc2VsZWN0aW9uJzogJ2lyb24tc2VsZWN0b3InLFxuICAgICdwYXBlci1idXR0b24tYmVoYXZpb3InOiAncGFwZXItYmVoYXZpb3JzJyxcbiAgICAncGFwZXItY2hlY2tlZC1lbGVtZW50LWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycycsXG4gICAgJ3BhcGVyLWlua3ktZm9jdXMtYmVoYXZpb3InOiAncGFwZXItYmVoYXZpb3JzJyxcbiAgICAncGFwZXItcmlwcGxlLWJlaGF2aW9yJzogJ3BhcGVyLWJlaGF2aW9ycydcbiAgfTtcbiAgZnVuY3Rpb24gZ2V0UGF0aEZvclBvbHltZXJGaWxlTmFtZShmaWxlUGF0aDogc3RyaW5nLCBkdHNGaWxlTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBkdHNGaWxlTmFtZSA9IGR0c0ZpbGVOYW1lLnJlcGxhY2UoLy1pbXBsJC8sICcnKTtcbiAgICB2YXIgcGF0aCA9IHBvbHltZXJQYXRoc0J5RmlsZU5hbWVbZHRzRmlsZU5hbWVdO1xuLy9jb25zb2xlLmluZm8oJy4uLi4uLi4uLi4uLi4uLi4uLi4ubG9va2luZyBmb3IgJyArIGR0c0ZpbGVOYW1lLCAnaW4nLCBmaWxlUGF0aCk7XG5cbiAgICBpZighcGF0aCkge1xuLy9jb25zb2xlLmluZm8oJzExMTExMTExMTExMTExMTExMTExICcsIGZpbGVQYXRoICsgJy4uLicgKyBkdHNGaWxlTmFtZSArICcvJyArIGR0c0ZpbGVOYW1lICsgJy5odG1sJyk7ICAgICAgXG4gICAgICBpZih2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoICsgZHRzRmlsZU5hbWUgKyAnLycgKyBkdHNGaWxlTmFtZSArICcuaHRtbCcpKSB7XG4gICAgICAgIHJldHVybiBkdHNGaWxlTmFtZTtcbiAgICAgIH1cbiAgICAgIHBhdGggPSBkdHNGaWxlTmFtZS5tYXRjaCgvW14tXSstW14tXSsvKVswXTtcbi8vY29uc29sZS5pbmZvKCcyMjIyMjIyMjIyMjIyMjIyMjIyMiAnLCBmaWxlUGF0aCArICcuLi4nICsgcGF0aCArICcvJyArIGR0c0ZpbGVOYW1lICsgJy5odG1sJyk7ICAgICAgXG4gICAgICBpZih2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoICsgcGF0aCArICcvJyArIGR0c0ZpbGVOYW1lICsgJy5odG1sJykpIHtcbiAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgICB9XG5cbmNvbnNvbGUuaW5mbygnISEhISEhISEhISEhISEhISEhISEhISEhISBmYWlsZWQgdG8gZmluZCBwYXRoIGZvcicsIGR0c0ZpbGVOYW1lKTsgICAgICBcbiAgICB9XG5cbiAgICByZXR1cm4gcGF0aDtcbiAgfVxuXG4gIGZ1bmN0aW9uIHZlcmlmeVBhdGhFeGlzdHMoZmlsZVBhdGgpOiBib29sZWFuIHtcbiAgICB0cnkge1xuICAgICAgaWYoZnMuYWNjZXNzU3luYykge1xuICAgICAgICBmcy5hY2Nlc3NTeW5jKGZpbGVQYXRoLCBmcy5GX09LKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGZzLmxzdGF0U3luYyhmaWxlUGF0aCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUsIGR0c0ZpbGVOYW1lPzogc3RyaW5nKSB7XG4gICAgLy8gRmluZCB0aGUgZmlsZSdzIHJlbGF0aXZlIHBhdGggdG8gYm93ZXJfY29tcG9uZW50c1xuICAgIHZhciBmaWxlUGF0aCA9IHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSwgZG90cyA9ICcnO1xuICAgIHdoaWxlKGZpbGVQYXRoKSB7XG4gICAgICBmaWxlUGF0aCA9IGZpbGVQYXRoLm1hdGNoKC8oLiopXFwvLiovKTtcbiAgICAgIGZpbGVQYXRoID0gZmlsZVBhdGggJiYgZmlsZVBhdGhbMV07XG4gICAgICBpZihmaWxlUGF0aCkge1xuICAgICAgICBpZih2ZXJpZnlQYXRoRXhpc3RzKGZpbGVQYXRoICsgJy9ib3dlcl9jb21wb25lbnRzJykpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBkb3RzICs9ICcuLi8nO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gV3JpdGUgb3V0IHRoZSBUeXBlU2NyaXB0IGNvZGVcbiAgICBpZihkdHNGaWxlTmFtZSkge1xuICAgICAgbGV0IGR0c1BhdGggPSBnZXRQYXRoRm9yUG9seW1lckZpbGVOYW1lKGZpbGVQYXRoICsgJy9ib3dlcl9jb21wb25lbnRzLycsIGR0c0ZpbGVOYW1lKTtcbiAgICAgIHBhdGgucGFyZW50UGF0aC5wYXJlbnRQYXRoLmFkZENvbW1lbnQoJ2xlYWRpbmcnLCAnLyA8cmVmZXJlbmNlIHBhdGg9XCInICsgZG90cyArICd0eXBpbmdzLycgKyBkdHNQYXRoICsgJy8nICsgZHRzRmlsZU5hbWUgKyAnLmQudHNcIi8+JywgdHJ1ZSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGgucGFyZW50UGF0aC5wYXJlbnRQYXRoLmFkZENvbW1lbnQoJ2xlYWRpbmcnLCAnLyA8cmVmZXJlbmNlIHBhdGg9XCInICsgZG90cyArICdib3dlcl9jb21wb25lbnRzL3BvbHltZXItdHMvcG9seW1lci10cy5kLnRzXCIvPicsIHRydWUpO1xuICAgIH1cbiAgfVxuXG4vKlxuVE9ETzogXG4tIG5lZWQgdG8gZXhwb3J0IGJlaGF2aW9yIGNsYXNzZXNcbi0gZGVjbGFyZSBiZWhhdmlvciBhcyBhYnN0cmFjdFxuLSBJbnRlbGxpSiBpcyBoYXBwaWVyIGlmIFRTRCBkZWNsYXJlcyBtdWx0aXBsZSBpbmhlcml0YW5jZSByYXRoZXIgdGhhbiBgaW1wbGVtZW50c2Bcbi0gLy8vIDxyZWZlcmVuY2UgcGF0aD1cIi4uLy4uL2Jvd2VyX2NvbXBvbmVudHMvLi4uLi5cbiovXG4gIC8qKlxuICAgIFRIZSBpbXBsZW1lbnRhdGlvbiBvZiB0aGlzIHByb2JhYmx5IGlzbid0IHNwb3Qgb24sIGZvciBub3cgSSBqdXN0IHdhbnQgdG8gZXh0cmFjdCBlbm91Z2ggdG8gZ2VuZXJhdGUgLmQudHMgZmlsZXNcbiAgICBmb3IgdGhlIFBvbHltZXIgTWF0ZXJpYWwgY29tcG9uZW50cy5cbiAgICAqL1xuICBmdW5jdGlvbiBwYXJzZVBvbHltZXJCZWhhdmlvckRlZmluaXRpb24oYXJyYXlFeHByZXNzaW9uLCBwYXRoLCBzdGF0ZSwgbWVtYmVyRXhwcmVzc2lvbikge1xuICAgIGxldCBjbGFzc0RlY2xhcmF0aW9uID0gdC5jbGFzc0RlY2xhcmF0aW9uKHQuaWRlbnRpZmllcihtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5jbGFzc0JvZHkoW10pLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtdKTtcbi8vY29uc29sZS5pbmZvKCctLS0tLS0tLS0tLScsIGFycmF5RXhwcmVzc2lvbikgICAgICA7XG4gICAgY2xhc3NEZWNsYXJhdGlvbi5pbXBsZW1lbnRzID0gYXJyYXlFeHByZXNzaW9uLmVsZW1lbnRzLm1hcCggKGJlaGF2aW9yKSA9PiB7XG4vL2NvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0nLCBiZWhhdmlvci5wcm9wZXJ0eS5uYW1lLCBtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUpICAgICAgO1xuICAgICAgaWYoYmVoYXZpb3IucHJvcGVydHkubmFtZSAhPSBtZW1iZXJFeHByZXNzaW9uLnByb3BlcnR5Lm5hbWUgKyAnSW1wbCcpIHtcbiAgICAgICAgYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUsIHRvRGFzaENhc2UoYmVoYXZpb3IucHJvcGVydHkubmFtZSkpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHQuY2xhc3NJbXBsZW1lbnRzKGJlaGF2aW9yLnByb3BlcnR5KTtcbiAgICB9KTtcbiAgICAvL2NsYXNzRGVjbGFyYXRpb24ubW9kaWZpZXJzID0gW3QuYWJzcmFjdF1cbiAgICBcbiAgICBwYXRoLnBhcmVudFBhdGgucmVwbGFjZVdpdGgodC5kZWNsYXJlTW9kdWxlKHQuaWRlbnRpZmllcihtZW1iZXJFeHByZXNzaW9uLm9iamVjdC5uYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuYmxvY2tTdGF0ZW1lbnQoW2NsYXNzRGVjbGFyYXRpb25dKSkpO1xuICB9XG5cbiAgZnVuY3Rpb24gcGFyc2VQb2x5bWVyQ2xhc3Mob2JqZWN0RXhwcmVzc2lvbiwgcGF0aCwgc3RhdGUsIG1lbWJlckV4cHJlc3Npb24/KSB7XG4vL2NvbnNvbGUuaW5mbygnPT09PT09PT09PT09PT09PT09PT09PT09PT09b2JqZWN0RXhwcmVzc2lvbjonLCBvYmplY3RFeHByZXNzaW9uKTsgICAgXG4vL2NvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tbWVtYmVyRXhwcmVzc2lvbjonLCBtZW1iZXJFeHByZXNzaW9uKTtcbiAgICBsZXQgY2xhc3NOYW1lLCBlbGVtZW50TmFtZSxcbiAgICAgICAgICAgICAgICBleHRlbmQsIGJlaGF2aW9ycywgaG9zdEF0dHJpYnV0ZXMsXG4gICAgICAgICAgICAgICAgcHJvcGVydGllcyAvKjogQXJyYXk8Q2xhc3NQcm9wZXJ0eT4gKi8gPSBbXSxcbiAgICAgICAgICAgICAgICBjb25zdHJ1Y3RvcixcbiAgICAgICAgICAgICAgICBmdW5jdGlvbnMgLyo6IEFycmF5PENsYXNzTWV0aG9kPiovID0gW107XG5cbiAgICBvYmplY3RFeHByZXNzaW9uLnByb3BlcnRpZXMuZm9yRWFjaCggKGNvbmZpZykgPT4ge1xuIC8vIGNvbnNvbGUuaW5mbygnLS0tLS0tLS0tLS0tLS0tLS0tJywgY29uZmlnKTtcbiAgICAgIHN3aXRjaChjb25maWcua2V5Lm5hbWUpIHtcbiAgICAgIGNhc2UgJ2lzJzpcbiAgICAgICAgZWxlbWVudE5hbWUgPSBjb25maWcudmFsdWUudmFsdWU7XG4gICAgICAgIGNsYXNzTmFtZSA9IHRvVXBwZXJDYW1lbChjb25maWcudmFsdWUudmFsdWUpO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1BhcnNpbmcgUG9seW1lciBlbGVtZW50JywgZWxlbWVudE5hbWUsICdpbicsIHN0YXRlLmZpbGUub3B0cy5maWxlbmFtZSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnZXh0ZW5kcyc6XG4gICAgICAgIGV4dGVuZCA9IGNvbmZpZy52YWx1ZS52YWx1ZTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdiZWhhdmlvcnMnOlxuICAgICAgICBiZWhhdmlvcnMgPSBjb25maWcudmFsdWUuZWxlbWVudHMubWFwKHBhcnNlUG9seW1lckJlaGF2aW9yUmVmZXJlbmNlLmJpbmQodW5kZWZpbmVkLCBzdGF0ZS5vcHRzLnVzZUJlaGF2aW9yRGVjb3JhdG9yKSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAncHJvcGVydGllcyc6XG4gICAgICAgIHByb3BlcnRpZXMgPSBjb25maWcudmFsdWUucHJvcGVydGllcy5tYXAocGFyc2VQb2x5bWVyUHJvcGVydHkpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ2hvc3RBdHRyaWJ1dGVzJzpcbiAgICAgICAgaG9zdEF0dHJpYnV0ZXMgPSBjb25maWcudmFsdWU7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnb2JzZXJ2ZXJzJzpcbiAgICAgICAgb2JzZXJ2ZXJzID0gcGFyc2VQb2x5bWVyRnVuY3Rpb25TaWduYXR1cmVQcm9wZXJ0aWVzKGNvbmZpZy52YWx1ZS5lbGVtZW50cyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnbGlzdGVuZXJzJzpcbiAgICAgICAgbGlzdGVuZXJzID0gcGFyc2VQb2x5bWVyRXZlbnRMaXN0ZW5lclByb3BlcnRpZXMoY29uZmlnLnZhbHVlLnByb3BlcnRpZXMpO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGlmKHQuaXNPYmplY3RNZXRob2QoY29uZmlnKSkge1xuICAgICAgICAgIGZ1bmN0aW9ucy5wdXNoKHQuY2xhc3NNZXRob2QoY29uZmlnLmtpbmQsIGNvbmZpZy5rZXksIGNvbmZpZy5wYXJhbXMsIGNvbmZpZy5ib2R5LCBjb25maWcuY29tcHV0ZWQsIGNvbmZpZy5zdGF0aWMpKTtcbiAgICAgICAgfSBlbHNlIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24oY29uZmlnLnZhbHVlKSkge1xuICAgICAgICAgIGxldCBtZXRob2QgPSBwYXJzZU5vblBvbHltZXJGdW5jdGlvbihjb25maWcpO1xuXG4gICAgICAgICAgaWYobWV0aG9kLmtleS5uYW1lID09ICdmYWN0b3J5SW1wbCcpIHtcbiAgICAgICAgICAgIG1ldGhvZC5rZXkubmFtZSA9IG1ldGhvZC5raW5kID0gJ2NvbnN0cnVjdG9yJztcbiAgICAgICAgICAgIGNvbnN0cnVjdG9yID0gbWV0aG9kO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBBZGQgb2JzZXJ2ZXIgZGVjb3JhdG9yc1xuICAgICAgICAgICAgbGV0IGZ1bmN0aW9uT2JzZXJ2ZXIgPSBvYnNlcnZlcnNbbWV0aG9kLmtleS5uYW1lXTtcbiAgICAgICAgICAgIGlmKGZ1bmN0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgICAgaWYoIW1ldGhvZC5kZWNvcmF0b3JzKSB7IG1ldGhvZC5kZWNvcmF0b3JzID0gW107IH1cbiAgICAgICAgICAgICAgICBtZXRob2QuZGVjb3JhdG9ycy5wdXNoKGZ1bmN0aW9uT2JzZXJ2ZXIpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBBZGQgbGlzdGVuZXIgZGVjb3JhdG9yc1xuICAgICAgICAgICAgbGV0IGZ1bmN0aW9uTGlzdGVuZXJzID0gbGlzdGVuZXJzW21ldGhvZC5rZXkubmFtZV07XG4gICAgICAgICAgICBpZihmdW5jdGlvbkxpc3RlbmVycykge1xuICAgICAgICAgICAgICBmdW5jdGlvbkxpc3RlbmVycy5mb3JFYWNoKCAobGlzdGVuZXIpID0+IHtcbiAgICAgICAgICAgICAgICBpZighbWV0aG9kLmRlY29yYXRvcnMpIHsgbWV0aG9kLmRlY29yYXRvcnMgPSBbXTsgfVxuICAgICAgICAgICAgICAgIG1ldGhvZC5kZWNvcmF0b3JzLnB1c2gobGlzdGVuZXIpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZ1bmN0aW9ucy5wdXNoKG1ldGhvZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHQuaXNPYmplY3RFeHByZXNzaW9uKSB7XG4gICAgICAgICAgcHJvcGVydGllcy5wdXNoKHQuY2xhc3NQcm9wZXJ0eSh0LmlkZW50aWZpZXIoY29uZmlnLmtleS5uYW1lKSwgY29uZmlnLnZhbHVlKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgY29uc29sZS53YXJuKFwiISEhISEhISEhISEgVW5leHBlY3RlZCBwcm9wZXJ0eTpcIiwgY29uZmlnLmtleSArICc6JywgY29uZmlnLnZhbHVlKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgbGV0IGRlY29yYXRvcnMgPSBbXVxuICAgIGlmKGVsZW1lbnROYW1lKSB7XG4gICAgICBkZWNvcmF0b3JzLnB1c2goY3JlYXRlRGVjb3JhdG9yKCdjb21wb25lbnQnLCBlbGVtZW50TmFtZSkpO1xuICAgICAgaWYoZXh0ZW5kKSB7XG4gICAgICAgIGRlY29yYXRvcnMucHVzaChjcmVhdGVEZWNvcmF0b3IoJ2V4dGVuZCcsIGV4dGVuZCkpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZihob3N0QXR0cmlidXRlcykge1xuICAgICAgZGVjb3JhdG9ycy5wdXNoKGNyZWF0ZURlY29yYXRvcignaG9zdEF0dHJpYnV0ZXMnLCBob3N0QXR0cmlidXRlcykpO1xuICAgIH1cbiAgICBpZihiZWhhdmlvcnMgJiYgc3RhdGUub3B0cy51c2VCZWhhdmlvckRlY29yYXRvcikge1xuICAgICAgZGVjb3JhdG9ycyA9IGRlY29yYXRvcnMuY29uY2F0KGJlaGF2aW9ycyk7XG4gICAgfVxuXG4gICAgLy8gQWRkIGFueSBwb3N0Q29uc3RydWN0b3JTZXR0ZXJzIChQb2x5bWVyIHByb3BlcnRpZXMgd2l0aCBhIGZ1bmN0aW9uIGZvciBgdmFsdWVgKVxuICAgIGxldCBjb25zdHVjdG9yQm9keSAvKjogQXJyYXk8U3RhdGVtZW50PiovID0gY29uc3RydWN0b3IgPyBjb25zdHJ1Y3Rvci5ib2R5LmJvZHkgOiBbXTtcblxuICAgIGZvcih2YXIga2V5IGluIHBvc3RDb25zdHVjdFNldHRlcnMpIHtcbiAgICAgIGxldCBwb3N0Q29uc3R1Y3RTZXR0ZXIgLyo6IEJsb2NrU3RhdGVtZW50IHwgRXhwcmVzc2lvbiAqLyA9IHBvc3RDb25zdHVjdFNldHRlcnNba2V5XTtcbiAgICAgIGNvbnN0dWN0b3JCb2R5LnB1c2godC5leHByZXNzaW9uU3RhdGVtZW50KFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuQXNzaWdubWVudEV4cHJlc3Npb24oJz0nLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5tZW1iZXJFeHByZXNzaW9uKHQudGhpc0V4cHJlc3Npb24oKSwgdC5pZGVudGlmaWVyKGtleSkpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5jYWxsRXhwcmVzc2lvbihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5hcnJvd0Z1bmN0aW9uRXhwcmVzc2lvbihbXSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmJsb2NrU3RhdGVtZW50KHBvc3RDb25zdHVjdFNldHRlcilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICAgICAgICAgICAgICAgICkpO1xuICAgIH1cbiAgICBpZihjb25zdHVjdG9yQm9keS5sZW5ndGgpIHtcbiAgICAgIHByb3BlcnRpZXMucHVzaChjb25zdHJ1Y3RvciB8fCB0LmNsYXNzTWV0aG9kKCdjb25zdHJ1Y3RvcicsIHQuaWRlbnRpZmllcignY29uc3RydWN0b3InKSwgW10sIHQuYmxvY2tTdGF0ZW1lbnQoY29uc3R1Y3RvckJvZHkpKSk7XG4gICAgfVxuXG4gICAgYWRkVHlwZURlZmluaXRpb25SZWZlcmVuY2UocGF0aCwgc3RhdGUpO1xuXG4gICAgaWYobWVtYmVyRXhwcmVzc2lvbikge1xuICAgICAgY2xhc3NOYW1lID0gbWVtYmVyRXhwcmVzc2lvbi5wcm9wZXJ0eS5uYW1lO1xuICAgIH1cblxuICAgIGxldCBjbGFzc0RlY2xhcmF0aW9uID0gdC5jbGFzc0RlY2xhcmF0aW9uKHQuaWRlbnRpZmllcihjbGFzc05hbWUpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbih0LmlkZW50aWZpZXIoJ3BvbHltZXInKSwgdC5pZGVudGlmaWVyKCdCYXNlJykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2xhc3NCb2R5KHByb3BlcnRpZXMuY29uY2F0KGZ1bmN0aW9ucykpLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGRlY29yYXRvcnMpO1xuXG4gICAgaWYoYmVoYXZpb3JzICYmICFzdGF0ZS5vcHRzLnVzZUJlaGF2aW9yRGVjb3JhdG9yKSB7XG4gICAgICBjbGFzc0RlY2xhcmF0aW9uLmltcGxlbWVudHMgPSBiZWhhdmlvcnMubWFwKCAoYmVoYXZpb3IpID0+IHtcbiAgICAgICAgcmV0dXJuIHQuY2xhc3NJbXBsZW1lbnRzKGJlaGF2aW9yKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGlmKG1lbWJlckV4cHJlc3Npb24pIHtcbi8vICAgICAgbGV0IG1vZHVsZSA9IHQuZGVjbGFyZU1vZHVsZSh0LmlkZW50aWZpZXIobWVtYmVyRXhwcmVzc2lvbi5vYmplY3QubmFtZSksXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdC5ibG9ja1N0YXRlbWVudChbY2xhc3NEZWNsYXJhdGlvbl0pKTtcbiAgICAgIGxldCBtb2R1bGUgPSB0LmJsb2NrU3RhdGVtZW50KFtjbGFzc0RlY2xhcmF0aW9uXSk7XG5cbiAgICAgIHBhdGgucGFyZW50UGF0aC5yZXBsYWNlV2l0aE11bHRpcGxlKFt0LmlkZW50aWZpZXIoJ21vZHVsZScpLCB0LmlkZW50aWZpZXIoJ1BvbHltZXInKSwgbW9kdWxlXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHBhdGgucGFyZW50UGF0aC5yZXBsYWNlV2l0aChjbGFzc0RlY2xhcmF0aW9uKTtcblxuICAgICAgcGF0aC5wYXJlbnRQYXRoLmluc2VydEFmdGVyKHQuZXhwcmVzc2lvblN0YXRlbWVudChcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQuY2FsbEV4cHJlc3Npb24oXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHQubWVtYmVyRXhwcmVzc2lvbihcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmlkZW50aWZpZXIoY2xhc3NOYW1lKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB0LmlkZW50aWZpZXIoJ3JlZ2lzdGVyJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgW11cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gZXZhbHVhdGVGdW5jdGlvbkV4cHJlc3Npb24oZnVuY3Rpb25FeHByZXNzaW9uKSB7XG4gICAgdmFyIG5hbWVkU3RhdGVtZW50cyA9IHt9LFxuICAgICAgcmVzdWx0O1xuLy9jb25zb2xlLmluZm8oJy0tLS0tLS0tLS0tLS0nLCBmdW5jdGlvbkV4cHJlc3Npb24pO1xuXG4gICAgZnVuY3Rpb25FeHByZXNzaW9uLmJvZHkuYm9keS5mb3JFYWNoKCAoc3RhdGVtZW50KSA9PiB7XG4vL2NvbnNvbGUuaW5mbygnICAgLi4uJywgc3RhdGVtZW50KSAgICAgIDtcbiAgICAgIGlmICh0LmlzUmV0dXJuU3RhdGVtZW50KHN0YXRlbWVudCkpIHtcbiAgICAgICAgcmVzdWx0ID0gc3RhdGVtZW50LmFyZ3VtZW50OyAgICAgICAgXG4gICAgICB9IGVsc2UgaWYgKHQuaXNGdW5jdGlvbkRlY2xhcmF0aW9uKHN0YXRlbWVudCkpIHtcbiAgICAgICAgbmFtZWRTdGF0ZW1lbnRzW3N0YXRlbWVudC5pZC5uYW1lXSA9IHQuZnVuY3Rpb25FeHByZXNzaW9uKG51bGwsIHN0YXRlbWVudC5wYXJhbXMsIHN0YXRlbWVudC5ib2R5KTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJlc3VsdC5wcm9wZXJ0aWVzLmZvckVhY2goIChwcm9wZXJ0eSkgPT4ge1xuICAgICAgaWYgKHQuaXNJZGVudGlmaWVyKHByb3BlcnR5LnZhbHVlKSkge1xuICAgICAgICBsZXQgc3RhdGVtZW50ID0gbmFtZWRTdGF0ZW1lbnRzW3Byb3BlcnR5LnZhbHVlLm5hbWVdO1xuICAgICAgICBpZiAoc3RhdGVtZW50ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBwcm9wZXJ0eS52YWx1ZSA9IHN0YXRlbWVudDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgdmlzaXRvcjoge1xuICAgICAgQ2FsbEV4cHJlc3Npb24ocGF0aCwgc3RhdGUpIHtcbiAgICAgICAgb2JzZXJ2ZXJzID0ge307XG4gICAgICAgIGxpc3RlbmVycyA9IHt9O1xuICAgICAgICBwb3N0Q29uc3R1Y3RTZXR0ZXJzID0ge307XG5cbi8vIGNvbnNvbGUuaW5mbygnMDAwMDAwMDAwMDAwMCAgJywgcGF0aC5ub2RlLmNhbGxlZS5uYW1lKTtcbiAgICAgICAgLy8gRm9yIHNvbWUgcmVhc29uIHdlIHZpc2l0IGVhY2ggaWRlbnRpZmllciB0d2ljZVxuICAgICAgICBpZihwYXRoLm5vZGUuY2FsbGVlLnN0YXJ0ICE9IHN0YXJ0KSB7XG4gICAgICAgICAgc3RhcnQgPSBwYXRoLm5vZGUuY2FsbGVlLnN0YXJ0O1xuICAgICAgICAgIGlmKHBhdGgubm9kZS5jYWxsZWUubmFtZSA9PSAnUG9seW1lcicpIHtcbiAgICAgICAgICAgIHBhcnNlUG9seW1lckNsYXNzKHBhdGgubm9kZS5hcmd1bWVudHNbMF0sIHBhdGgsIHN0YXRlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0sXG5cbiAgICAgIEFzc2lnbm1lbnRFeHByZXNzaW9uKHBhdGgsIHN0YXRlKSB7XG4vL2NvbnNvbGUuaW5mbygnc2FkZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmJyk7XG4gICAgICAgIGlmKHQuaXNNZW1iZXJFeHByZXNzaW9uKHBhdGgubm9kZS5sZWZ0KSkge1xuLy9jb25zb2xlLmluZm8oJzEuLi4uLi4uLi4uLi4uIHBhdGgubm9kZTonLCBwYXRoLm5vZGUpO1xuICAgICAgICAgIGlmKHBhdGgubm9kZS5sZWZ0Lm9iamVjdC5uYW1lID09ICdQb2x5bWVyJykge1xuICAgICAgICAgICAgbGV0IGNsYXNzTmFtZSA9IHBhdGgubm9kZS5sZWZ0Lm9iamVjdC5uYW1lICsgJy4nICsgcGF0aC5ub2RlLmxlZnQucHJvcGVydHkubmFtZTtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnUGFyc2luZyBQb2x5bWVyIGJlaGF2aW9yJywgY2xhc3NOYW1lLCAnaW4nLCBzdGF0ZS5maWxlLm9wdHMuZmlsZW5hbWUpO1xuLy9jb25zb2xlLmluZm8oJzIuLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uJywgcGF0aC5ub2RlLmxlZnQpO1xuLy9jb25zb2xlLmluZm8oJzMuLi4uLi4uLi4uLi4uJywgcGF0aC5ub2RlLnJpZ2h0LnR5cGUpO1xuICAgICAgICAgICAgaWYodC5pc0NhbGxFeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodCkpIHtcbiAgICAgICAgICAgICAgaWYocGF0aC5ub2RlLnJpZ2h0LmNhbGxlZS5uYW1lID09ICdQb2x5bWVyJykge1xuICAgICAgICAgICAgICAgIHBhcnNlUG9seW1lckNsYXNzKHBhdGgubm9kZS5yaWdodC5hcmd1bWVudHNbMF0sIHBhdGgsIHN0YXRlKTsgLy8sIHBhdGgubm9kZS5sZWZ0KTtcbiAgICAgICAgICAgICAgfSBlbHNlIGlmKHQuaXNGdW5jdGlvbkV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0LmNhbGxlZSkpIHtcbiAgICAgICAgICAgICAgICBsZXQgZXhwcmVzc2lvbiA9IGV2YWx1YXRlRnVuY3Rpb25FeHByZXNzaW9uKHBhdGgubm9kZS5yaWdodC5jYWxsZWUpOyAgICAgICAgICAgICAgICBcbiAgICAgICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhleHByZXNzaW9uLCBwYXRoLCBzdGF0ZSwgcGF0aC5ub2RlLmxlZnQpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc09iamVjdEV4cHJlc3Npb24ocGF0aC5ub2RlLnJpZ2h0KSkge1xuICAgICAgICAgICAgICBwYXJzZVBvbHltZXJDbGFzcyhwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYodC5pc0FycmF5RXhwcmVzc2lvbihwYXRoLm5vZGUucmlnaHQpKSB7XG4gICAgICAgICAgICAgIHBhcnNlUG9seW1lckJlaGF2aW9yRGVmaW5pdGlvbihwYXRoLm5vZGUucmlnaHQsIHBhdGgsIHN0YXRlLCBwYXRoLm5vZGUubGVmdCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gbG9nUGF0aChwYXRoKSB7XG4gIGZvcih2YXIgcHJvcE5hbWUgaW4gcGF0aCkge1xuICAgIGlmKHBhdGguaGFzT3duUHJvcGVydHkocHJvcE5hbWUpXG4gICAgICAmJiBwcm9wTmFtZSAhPSAncGFyZW50UGF0aCcgJiYgcHJvcE5hbWUgIT0gJ3BhcmVudCdcbiAgICAgICYmIHByb3BOYW1lICE9ICdodWInXG4gICAgICAmJiBwcm9wTmFtZSAhPSAnY29udGFpbmVyJykge1xuICAgICAgY29uc29sZS5sb2cocHJvcE5hbWUsIHBhdGhbcHJvcE5hbWVdKTtcbiAgICB9XG4gIH1cbn1cbiJdLCJzb3VyY2VSb290IjoiL3NvdXJjZS8ifQ==
