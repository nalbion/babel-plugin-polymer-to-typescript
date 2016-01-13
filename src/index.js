function default_1(_a) {
    var t = _a.types;
    console.info('transforming for typescript-ts...');
    var start = -1, observers = {}, listeners = {}, postConstuctSetters = {};
    // plugin options get passed into plugin visitors through the `state` variable
    /*
    Polymer({
      is: 'my-greeting',
    
      properties: {
        greeting: {
          type: String,
          value: 'Welcome!',
          notify: true
        }
      }
    });
    
    @component('my-greeting')
    class MyGreeting extends polymer.Base {
       @property({ type: String, notify: true })
       greeting: string = 'Welcome!';
    }
    MyGreeting.register();
    */
    function toUpperCamel(str) {
        return str.replace(/^[a-z]|(\-[a-z])/g, function ($1) { return $1.toUpperCase().replace('-', ''); });
    }
    function createDecorator(name, value) {
        // if(typeof value == 'string') {
        return t.decorator(t.callExpression(t.identifier(name), [typeof value == 'string' ? t.stringLiteral(value) : value]));
        // } else {
        //   return t.decorator(t.callExpression(t.identifier(name), [t.stringLiteral(value)]));
        // }
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
                    // type = attribute.value.value;
                    //        type = attribute.value; 
                    //TODO - something like this?...
                    type = t.createTypeAnnotationBasedOnTypeof(attribute.value.name.toLowerCase());
                    // type = t.typeAnnotation(t.stringTypeAnnotation()),
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
            // value is FunctionExpression
            // TODO: add to postConstruct      
            // let body /*: Array<Statement> */ = value.body.body,
            //     params = value.params,
            //     directives /*: Array<Directive> */ = []; //t.directive(t.directiveLiteral('asdfasfd'))];
            // body = t.blockStatement(body, directives);
            // // kind, key, params, body, computed, static
            // return t.ClassMethod('method', t.identifier(name), params, body); //, t.typeAnnotation(type), decorators) :
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
                    // path.container.leadingComments: Array.<CommentBlock | CommentLine>
                    // path.addComment/s(), 
                    // path.assertXxxx()
                    // path.find/Parent()
                    // path.get(key: string, context?: boolean|TraversalContext)
                    // path.getAncestry()   getData()     getFunctionParent()   
                    // getSibling(key)  getStatementParent()  getTypeAnnotation()
                    // path.insertAfter/Before(nodes)    replaceInline  replaceWith/Multiple/SourceString
                    // path.isXxxx()
                    // path.requeue
                    if (path.node.callee.name == 'Polymer') {
                        var elementName, className, extend, behaviors, hostAttributes, properties /*: Array<ClassProperty> */ = [], constructor, functions /*: Array<ClassMethod>*/ = [];
                        // console.info('Polymer element config:', path.node.arguments[0].properties);
                        path.node.arguments[0].properties.forEach(function (config) {
                            // console.info(config);
                            var key = config.key.name, type = config.value.type, value = config.value.value;
                            switch (key) {
                                case 'is':
                                    elementName = value;
                                    className = toUpperCamel(value);
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
                            // TODO: skip = true; // don't add the standard Polymer properties to the polymer-ts class
                        });
                        // console.info(path.replaceWithSourceString);
                        //path.replaceWith(t.identifier('dude'));
                        // path.replaceWith(t.debuggerStatement());
                        // path.parentPath.replaceWithSourceString('class Foo { bar() {console.info();} }');
                        // path.parentPath.replaceWithSourceString(replacement);
                        // path.parentPath.insertBefore(t.expressionStatement(t.stringLiteral("Because I'm easy come, easy go.")));
                        // path.parentPath.remove();
                        //path.insertAfter(t.classDeclaration(
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
                        // Write out the TypeScript code
                        path.container.leadingComments = path.container.leadingComments || [];
                        // path.container.replaceWithSourceString('/// foo')
                        // path.container.leadingComments.splice(0, 0, t.file(t.program([], '/ <reference path="../bower_components/polymer-ts/polymer-ts.d.ts" />')));
                        // path.container.addComment('asdf');
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
exports["default"] = default_1;
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
//# sourceMappingURL=index.js.map