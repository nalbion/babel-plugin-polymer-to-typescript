//import template from "babel-template";

// var _ = require('underscore');
// var babel = require('babel');

//export default function(babel) {
// export default function({ types: t }) {
module.exports = function({ types: t }) {
	console.info('transforming for typescript-ts...');
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

  function toUpperCamel(str: string){
    return str.replace(/^[a-z]|(\-[a-z])/g, function($1){return $1.toUpperCase().replace('-','');});
  }

  function parseAttributeValue(value) {

  }

  function parseProperty(name: string, attributes) {
    let type, value, readonly = false, decorator = [];

    attributes.forEach( (attribute) => {  
      let attr_name: string = attribute.key.name;

      switch(attr_name):
      case 'type':
        // one of Boolean, Date, Number, String, Array or Object
        type = attribute.value.value;
        decorator.push(attr_name + ': ' + attribute.value.name);
        break;
      case 'value':
        // Default value for the property
        if(t.isStringLiteral(attribute.value)) {
          value = "'" + attribute.value.value + "'":
          if(type === undefined) { type = 'String'; }
        } else {
          value = attribute.value.value;
          if(t.isBooleanLiteral(attribute.value)) {
            if(type === undefined) { type = 'Boolean'; }
          }
        }
        break;
      case 'readonly':
        readonly = true;
        // fall-through
      case 'reflectToAttribute':
      case 'notify':
        decorator.push(attr_name + ': ' + attribute.value.value);
        break;
      case 'computed':
      case 'observer':
        // computed function call (as string)
        decorator.push(attr_name + ': \'' + attribute.value.value + '\'');
        break;
      default:
        console.warn('Unexpected property attribute: ', attribute);
        decorator.push(attr_name + ': ' + 
                      (t.isStringLiteral(attribute.value) ?
                        "'" + attribute.value.value + "'" :
                        attribute.value.value));
      }

/*      if(t.isIdentifier(attribute.value)) {
        if(attribute.key.name != 'value') {
          decorator.push('type: ' + attribute.value.name);
          if(attribute.key.name == 'type') {
            declaration += ': ' + attribute.value.name.toLowerCase();
          }
        }
      } else if(t.isStringLiteral(attribute.value)) {
        if(attribute.key.name == 'value') {
          declaration += ' = \'' + attribute.value.value + '\'';
        } else {
          decorator.push(attribute.key.name + ': \'' + attribute.value.value + '\'');
          if(attribute.key.name == 'type') {
            declaration += ': ' + attribute.value.name;
          }
        }
      } else if(t.isBooleanLiteral(attribute.value)) {
        if(attribute.key.name == 'value') {
          declaration += ': boolean';
        } else {
          decorator.push(attribute.key.name + ': ' + attribute.value.value);
        }
      } else {
        console.info('           ', attribute.key.name + ': ' + attribute.value.value, attribute.value.type);
      }*/
    });

    decorator   = '    @property({ ' + decorator.join(', ') + ' })';
    declaration = '    public ';
    // if (readonly) {
    //   declaration += 'get ' + name + '()';
    // } else {
      declaration += name;
    // }
    if(type !== undefined) {
      declaration += ': ' + type.toLowerCase()
    }
    if(value !== undefined) {
      declaration += ' = ' + value;
    }
    declaration += ';'

    return decorator + '\n' + declaration + '\n';
  }

  const propertiesVisitor = {
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
  };

  function logPath(path) {
    for(var propName in path) {
        if(path.hasOwnProperty(propName) 
          && propName != 'parentPath' && propName != 'parent' 
          && propName != 'hub'
          && propName != 'container') {
          console.log(propName, path[propName]);
          //console.log(propName);
        }
      }
  }

  const polymerVisitor = {
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
    FunctionExpression(path) {
      var name = path.scope.parentBlock.key.name;
      console.log("  Visiting FunctionExpression: ", name);
      if(name == 'factoryImpl') {
        // TODO: use 'constructor' instead of 'factoryImpl', use the same params
        logPath(path.node.params.forEach( (param) => {
          console.info('     param: ', param.name);
        });
      } else if (observers[name]) {
        console.info('this is an observer:', observers[name]);
      } else if (listeners[name]) {
        console.info('this is a listener:', listeners[name]);
      }


      // logPath(path.scope.parentBlock);
    },

    MemberExpression(path) {
      // console.log("  Visiting MemberExpression: ", path.type, path.node.name);
    },

    Identifier(path) {
        // console.log("  Visiting: ", path.type, path.node.name);
      //  console.info('path:', path.node);
        if (path.isReferencedIdentifier()) {
          // ...
        }
      }
  };

  var start = -1,
      observers = {},
      listeners = {};

  return {
    visitor: {
      CallExpression(path) {
        // For some reason we visit each identifier twice
        if(path.node.callee.start != start) {
          start = path.node.callee.start;
          if(path.node.callee.name == 'Polymer') {
            let elementName, className, extend,
                properties = '';

console.info('---------------------');
// console.info(t);
//            logPath(path);
            
            // console.info('Polymer element config:', path.node.arguments[0].properties);
            path.node.arguments[0].properties.forEach(function(config) {
              // console.info(config);
              var key = config.key.name,
                type = config.value.type,
                value = config.value.value;
              switch(key) {
              case 'is':
                elementName = value;
                className = toUpperCamel(value);
                break;
              case 'extends':
                extend = value;
                break;
              case 'properties':
                config.value.properties.forEach(function(property) {
                  properties += parseProperty(<string> property.key.name, property.value.properties);
                });
                break;
              case 'observers':
                config.value.elements.forEach( (observer) => {
                  observers[observer.value.match(/([^\(]+).*/)[1]] = observer.value;
                });
                break;
              case 'listeners':
                config.value.elements.forEach( (listener) => {
                  listeners[listener.value.match(/([^\(]+).*/)[1]] = listener.value;
                });
                break;
              default:
                // console.log("  " + key + ':', value, type);  
              }
            });

            path.traverse(polymerVisitor);

            var replacement =''; // '@component(\'' + elementName + '\')\n';
            if(extend) {
              // replacement += '@extend(\'' + extend + '\')\n';
            }
            replacement += 'class ' + className + ' extends polymer.Base {';
            // replacement += properties;
            replacement += '}';
            // replacement += className + '.register();';
            console.info(replacement);

            console.info('console.info(path.node.replaceWithSourceString);......');
            // console.info(path.replaceWithSourceString);
            //path.replaceWith(t.identifier('dude'));
            // path.replaceWith(t.debuggerStatement());
            // path.parentPath.replaceWithSourceString('class Foo { bar() {console.info();} }');
            // path.parentPath.replaceWithSourceString(replacement);
            // path.parentPath.insertBefore(t.expressionStatement(t.stringLiteral("Because I'm easy come, easy go.")));

            // path.remove();
            path.insertAfter(t.classDeclaration(
                                                // id: Identifier
                                                t.identifier(className),
                                                // superClass?: Expression
                                                t.memberExpression(
                                                  t.identifier('polymer'),
                                                  t.identifier('Base'),
                                                ),
                                                // body: ClassBody
                                                t.classBody([
                                                  // Array.<ClassMethod|ClassProperty
                                                ]),
                                                // decorators: Array.<Decorator>
                                                [
                                                  t.decorator(
                                                    t.callExpression(
                                                        t.identifier('component'),
                                                        [t.stringLiteral(elementName)]
                                                    )
                                                ]
                              ));
            // path.replaceWith(t.classExpression(t.identifier('ClassExpression')));


            // path.replaceWith(t.classDeclaration({id: t.identifier('FooClass')});
            // path.replaceWith(t.functionExpression(t.identifier('asdf'), [], []) );
            // path.replaceWith(t.objectExpression([t.objectMethod('method', 
            //                                     t.identifier('asdf'), 
            //                                     t.blockStatement([t.expressionStatement(t.stringLiteral('my object method'))]))]));

            // path.parentPath.insertAfter(t.expressionStatement(className + '.register();'));
            //path.replacemenWith(t.functionDeclaration([t.identifier(id:'foo')]));
            //path.replaceWith(t.blockStatement([t.expressionStatement('dude')]));


            // console.info(path.node.replaceWithSourceString);
            // console.info(path.node.callee.replaceWithSourceString);
            // path.node.callee.replaceWithSourceString(replacement);
            //path.replaceWithSourceString(replacement);
            //path.replaceWith(t.expressionStatement(t.stringLiteral((replacement))));
            // path.replaceWith(t.toExpression('class ' + className + ' extends polymer.Base {}'));
            //path.replaceWith(t.decorator(t.expressionStatement('component(\'' + elementName + '\')')));
          }
        }
      }
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