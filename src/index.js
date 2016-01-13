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
        return t.decorator(t.callExpression(t.identifier(name), [t.stringLiteral(value)]));
    }
    function createDecoratorProperty(key, value) {
        if (typeof value != 'string') {
            value = value.toString();
        }
        return t.objectProperty(t.identifier(key), t.identifier(value));
    }
    /*  function createTypeAnnotationBasedOnTypeof(type: string) {
        if (type === "string") {
          return t.stringTypeAnnotation();
        } else if (type === "number") {
          return t.numberTypeAnnotation();
        } else if (type === "undefined") {
          return t.voidTypeAnnotation();
        } else if (type === "boolean") {
          return t.booleanTypeAnnotation();
        } else if (type === "function") {
          return t.genericTypeAnnotation(t.identifier("Function"));
        } else if (type === "object") {
          return t.genericTypeAnnotation(t.identifier("Object"));
        } else if (type === "symbol") {
          return t.genericTypeAnnotation(t.identifier("Symbol"));
        } else {
          throw new Error("Invalid typeof value");
        }
      }*/
    /*  const propertiesVisitor = {
        // ObjectExpression(path) {
        ObjectProperty(path) {
          if(t.isObjectExpression(path.node.value)) {
            path.traverse(propertyVisitor);
          } else {
    
          // console.info('    *************** oe: ', path.node);
          var node = path.node,
            key = node.key.name,
            type = node.value.type,
            value = node.value.value;
          console.log("      @property ", key + ':', value, type);
          }
        }
      };
    
      const propertyVisitor = {
        ObjectProperty(path) {
          // console.info('    *************** oe: ', path.node);
          var prop = path.node;
          
              // path.node.value.properties.forEach( function(prop) {
    
                if(t.isIdentifier(prop.value)) {
                  console.info('           ', prop.key.name + ': ' + prop.value.name);
                } else if(t.isStringLiteral(prop.value)) {
                  console.info('           ', prop.key.name + ': \'' + prop.value.value + '\'');
                } else if(t.isBooleanLiteral(prop.value)) {
                  console.info('           ', prop.key.name + ': ' + prop.value.value);
                } else {
                  console.info('           ', prop.key.name + ': ' + prop.value.value, prop.value.type);
                }
              // });
        }
      }; */
    var polymerVisitor = {
        // ObjectProperty(path) {
        //   var node = path.node,
        //     key = node.key.name,
        //     type = node.value.type,
        //     value = node.value.value;
        //   switch(key) {
        //   case 'is':
        //     console.log('  class ' + toUpperCamel(value) + ' extends polymer.Base {');
        //     break;
        //   case 'properties':
        //     // console.log("  @property()" + key);
        //     // console.log("   ...", value, type);  
        //     path.traverse(propertiesVisitor);
        //     break;
        //   default:
        //     console.log("  " + key + ':', value, type);  
        //   }
        // },
        FunctionExpression: function (path) {
            var name = path.scope.parentBlock.key.name;
            console.log("  Visiting FunctionExpression: ", name);
            if (name == 'factoryImpl') {
                // TODO: use 'constructor' instead of 'factoryImpl', use the same params
                logPath(path.node.params.forEach(function (param) {
                    console.info('     param: ', param.name);
                }));
            }
            else if (observers[name]) {
                console.info('this is an observer:', observers[name]);
            }
            else if (listeners[name]) {
                console.info('this is a listener:', listeners[name]);
            }
            // logPath(path.scope.parentBlock);
        },
        MemberExpression: function (path) {
            // console.log("  Visiting MemberExpression: ", path.type, path.node.name);
        },
        Identifier: function (path) {
            // console.log("  Visiting: ", path.type, path.node.name);
            //  console.info('path:', path.node);
            if (path.isReferencedIdentifier()) {
            }
        }
    };
    function parsePolymerFunctionSignatureProperties(elements) {
        return elements.reduce(function (results, signature) {
            results[signature.value.match(/([^\(]+).*/)[1]] = signature.value;
            return results;
        }, {});
    }
    function parsePolymerProperties(properties) {
        return properties.map(parseProperty);
    }
    function parseProperty(property) {
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
                    if (attribute.value.type == 'FunctionExpression') {
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
        /*    // let decorator   = '    @property({ ' + decorators.join(', ') + ' })';
            let declaration = '    public ';
            // if (readonly) {
            //   declaration += 'get ' + name + '()';
            // } else {
              declaration += name;
            // }
            // if(type !== undefined) {
            //   declaration += ': ' + type.toLowerCase()
            // }
            if(value !== undefined) {
              declaration += ' = ' + value;
            }
            declaration += ';'*/
        // return decorator + '\n' + declaration + '\n';
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
    return {
        visitor: {
            // TODO: insert '/// <reference path="../bower_components/polymer-ts/polymer-ts.d.ts" />'
            CallExpression: function (path) {
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
                        var elementName, className, extend, properties /*: Array<ClassProperty> */ = [];
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
                                case 'properties':
                                    properties = parsePolymerProperties(config.value.properties);
                                    // config.value.properties.forEach(function(property) {
                                    //   properties += parseProperty(<string> property.key.name, property.value.properties);
                                    // });
                                    break;
                                case 'observers':
                                    observers = parsePolymerFunctionSignatureProperties(config.value.elements);
                                    break;
                                case 'listeners':
                                    listeners = parsePolymerFunctionSignatureProperties(config.value.elements);
                                    break;
                                default:
                                    // console.log("  " + key + ':', value, type);  
                                    return;
                            }
                            // TODO: skip = true; // don't add the standard Polymer properties to the polymer-ts class
                        });
                        path.traverse(polymerVisitor);
                        var replacement = ''; // '@component(\'' + elementName + '\')\n';
                        if (extend) {
                        }
                        replacement += 'class ' + className + ' extends polymer.Base {';
                        // replacement += properties;
                        replacement += '}';
                        // replacement += className + '.register();';
                        // console.info(replacement);
                        console.info('console.info(path.node.replaceWithSourceString);......');
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
                        var params = [], constuctorBody /*: Array<Statement>*/ = [];
                        //postConstuctSetters.forEach( (postConstuctSetter) => {
                        for (var key in postConstuctSetters) {
                            var postConstuctSetter /*: BlockStatement | Expression */ = postConstuctSetters[key];
                            constuctorBody.push(t.expressionStatement(t.AssignmentExpression('=', t.memberExpression(t.thisExpression(), t.identifier(key)), t.callExpression(t.arrowFunctionExpression([], t.blockStatement(postConstuctSetter)), []))));
                        }
                        if (constuctorBody.length) {
                            properties.push(t.classMethod('constructor', t.identifier('constructor'), params, t.blockStatement(constuctorBody)));
                        }
                        path.parentPath.replaceWith(t.classDeclaration(
                        // id: Identifier
                        t.identifier(className), 
                        // superClass?: Expression
                        t.memberExpression(t.identifier('polymer'), t.identifier('Base')), 
                        // body: ClassBody
                        t.classBody(properties), 
                        /*t.classBody([
                          // Array.<ClassMethod|ClassProperty
                          t.ClassProperty(
                            t.identifier('key'),
                            t.stringLiteral('value'),
                            // typeAnnotation
                            t.typeAnnotation(t.stringTypeAnnotation()),
                            // decorators
                            [
                              t.decorator(
                                t.callExpression(
                                  t.identifier('property'),
                                  [t.objectExpression([
                                    t.objectProperty(
                                      t.identifier('type'),
                                      t.identifier('String')
                                    )
                                  ])]
                                )
                              )
                            ]
                          )
                        ]),*/
                        // decorators: Array.<Decorator>
                        decorators));
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
/*
module.exports = function (file, options, cb) {
  var source = file.buffer.toString();
  options = _.extend({filename: file.path}, options);
  try {
    console.info('transforming for typescript-ts...');
    source = 'DUDE'; // babel.transform(source, options).code + '\n';
  } catch (er) {
    if (er.codeFrame) er.message += '\n' + er.codeFrame;
    return cb(er);
  }
  cb(null, {buffer: new Buffer(source)});
};*/ 
//# sourceMappingURL=index.js.map