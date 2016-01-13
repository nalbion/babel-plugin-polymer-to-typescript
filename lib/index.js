/// <reference path="node.d.ts" />
var fs = require('fs');
function default_1(_a) {
    var t = _a.types;
    var start = -1, observers = {}, listeners = {}, postConstuctSetters = {};
    function toUpperCamel(str) {
        return str.replace(/^[a-z]|(\-[a-z])/g, function ($1) { return $1.toUpperCase().replace('-', ''); });
    }
    function createDecorator(name, value) {
        return t.decorator(t.callExpression(t.identifier(name), [typeof value == 'string' ? t.stringLiteral(value) : value]));
    }
    function createDecoratorProperty(key, value) {
        if (typeof value != 'string') {
            value = value.toString();
        }
        return t.objectProperty(t.identifier(key), t.identifier(value));
    }
    function parsePolymerFunctionSignatureProperties(elements) {
        return elements.reduce(function (results, signature) {
            results[signature.value.match(/([^\(]+).*/)[1]] = signature.value;
            return results;
        }, {});
    }
    function parsePolymerProperty(property) {
        var name = property.key.name, attributes = property.value.properties, type, value, isFunction, params, readonly = false, decoratorProps = [];
        attributes.forEach(function (attribute) {
            var attr_name = attribute.key.name;
            switch (attr_name) {
                case 'type':
                    // one of Boolean, Date, Number, String, Array or Object
                    type = t.createTypeAnnotationBasedOnTypeof(attribute.value.name.toLowerCase());
                    decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.name));
                    break;
                case 'value':
                    // Default value for the property
                    value = attribute.value;
                    if (t.isFunctionExpression(attribute.value)) {
                        isFunction = true;
                        params = [];
                    }
                    if (type === undefined) {
                        if (t.isStringLiteral(attribute.value)) {
                            // TODO: select proper type
                            type = t.typeAnnotation(t.stringTypeAnnotation());
                        }
                        else if (t.isBooleanLiteral(attribute.value)) {
                            type = t.typeAnnotation(t.booleanTypeAnnotation());
                        }
                    }
                    break;
                case 'readonly':
                    readonly = true;
                // fall-through
                case 'reflectToAttribute':
                case 'notify':
                    decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.value));
                    break;
                case 'computed':
                case 'observer':
                    // computed function call (as string)
                    decoratorProps.push(createDecoratorProperty(attr_name, '\'' + attribute.value.value + '\''));
                    break;
                default:
                    console.warn('Unexpected property attribute: ', attribute);
                    decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.value));
            }
        });
        var decorators = [t.decorator(t.callExpression(t.identifier('property'), [t.objectExpression(decoratorProps)]))];
        if (isFunction) {
            postConstuctSetters[name] = value.body.body;
            var result = t.ClassProperty(t.identifier(name), undefined, t.typeAnnotation(type), decorators);
        }
        else {
            var result = t.ClassProperty(t.identifier(name), value, t.typeAnnotation(type), decorators);
        }
        result.leadingComments = property.leadingComments;
        return result;
    }
    function parsePolymerBehavior(useBehaviorDecorator, node) {
        return useBehaviorDecorator ? createDecorator('behavior', node.name) : node.name;
    }
    function parseNonPolymerFunction(node) {
        var name = node.key.name, params = node.value.params, body /*: Array<Statement */ = node.value.body.body;
        var method = t.ClassMethod('method', t.identifier(name), params, t.blockStatement(body));
        method.leadingComments = node.leadingComments;
        return method;
    }
    return {
        visitor: {
            CallExpression: function (path, state) {
                // For some reason we visit each identifier twice        
                if (path.node.callee.start != start) {
                    start = path.node.callee.start;
                    if (path.node.callee.name == 'Polymer') {
                        var elementName, className, extend, behaviors, hostAttributes, properties /*: Array<ClassProperty> */ = [], constructor, functions /*: Array<ClassMethod>*/ = [];
                        path.node.arguments[0].properties.forEach(function (config) {
                            var key = config.key.name, type = config.value.type, value = config.value.value;
                            switch (key) {
                                case 'is':
                                    elementName = value;
                                    className = toUpperCamel(value);
                                    console.info('Parsing Polymer element', elementName, 'in', state.file.opts.filename);
                                    break;
                                case 'extends':
                                    extend = value;
                                    break;
                                case 'behaviors':
                                    behaviors = config.value.elements.map(parsePolymerBehavior.bind(undefined, state.opts.useBehaviorDecorator));
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
                                    listeners = parsePolymerFunctionSignatureProperties(config.value.elements);
                                    break;
                                default:
                                    if (t.isFunctionExpression(config.value)) {
                                        var method = parseNonPolymerFunction(config);
                                        if (method.key.name == 'factoryImpl') {
                                            method.key.name = method.kind = 'constructor';
                                            constructor = method;
                                        }
                                        else {
                                            functions.push(method);
                                        }
                                    }
                                    else {
                                        console.warn("Unexpected property:", key + ':', value, type);
                                    }
                            }
                        });
                        var decorators = [createDecorator('component', elementName)];
                        if (extend) {
                            decorators.push(createDecorator('extend', extend));
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
                        // Find the file's relative path to bower_components
                        var filePath = state.file.opts.filename, dots = '';
                        while (filePath) {
                            filePath = filePath.match(/(.*)\/.*/);
                            filePath = filePath && filePath[1];
                            if (filePath) {
                                try {
                                    if (fs.accessSync) {
                                        fs.accessSync(filePath + '/bower_components', fs.F_OK);
                                    }
                                    else {
                                        fs.lstatSync(filePath + '/bower_components');
                                    }
                                    break;
                                }
                                catch (e) {
                                    dots += '../';
                                }
                            }
                        }
                        // Write out the TypeScript code
                        path.parentPath.parentPath.addComment('leading', '/ <reference path="' + dots + 'bower_components/polymer-ts/polymer-ts.d.ts"/>', true);
                        var classDeclaration = t.classDeclaration(t.identifier(className), t.memberExpression(t.identifier('polymer'), t.identifier('Base')), t.classBody(properties.concat(functions)), decorators);
                        if (behaviors && !state.opts.useBehaviorDecorator) {
                            classDeclaration.implements = behaviors.map(function (behavior) {
                                return t.classImplements(t.identifier(behavior));
                            });
                        }
                        path.parentPath.replaceWith(classDeclaration);
                        path.parentPath.insertAfter(t.expressionStatement(t.callExpression(t.memberExpression(t.identifier(className), t.identifier('register')), [])));
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
