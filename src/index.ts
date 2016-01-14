/// <reference path="node.d.ts" />
import fs = require('fs');

export default function({ types: t }) {
	var start = -1,
      observers = {},
      listeners = {},
      postConstuctSetters = {};

  function toUpperCamel(str: string){
    return str.replace(/^[a-z]|(\-[a-z])/g, function($1){return $1.toUpperCase().replace('-','');});
  }

  function createDecorator(name: string, value) {
      return t.decorator(t.callExpression(t.identifier(name), 
              [typeof value == 'string' ? t.stringLiteral(value) : value]));
  }

  function createDecoratorProperty(key: string, value: string) {
    if(typeof value != 'string') {
      value = value.toString();
    }
    return t.objectProperty(
      t.identifier(key),
      t.identifier(value)
    );
  }

  /** @param type - one of Boolean, Date, Number, String, Array or Object */
  function createTypeAnnotation(type: string) {
    switch(type) {
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
      return t.typeAnnotation(t.arrayTypeAnnotation());
    case 'Object':
    default:
      return t.typeAnnotation(t.genericTypeAnnotation(t.identifier(type)));
    }
  }

  function parsePolymerFunctionSignatureProperties(elements: {value: string}[]) {
    return elements.reduce( (results: any, signature: {value: string}) => {
      let match = signature.value.match(/([^\(]+)\(([^\)]+)/),
        functionName = match[1],
        observedProperties = match[2];
      results[functionName] = createDecorator('observe', observedProperties);
      return results;
    }, {});
  }

  function parsePolymerEventListenerProperties(properties) {
    return properties.reduce( (results, property) => {
      let eventName = property.key.value,
          functionName = property.value.value,
          functionEvents = results[functionName];
      if(!functionEvents) {
        functionEvents = results[functionName] = [];
      }
      functionEvents.push(createDecorator('listen', eventName));
      return results;
    }, {});
  }

  function parsePolymerBehavior(useBehaviorDecorator, node) {
    return useBehaviorDecorator ? createDecorator('behavior', node) : node;
  }

  function parseNonPolymerFunction(node) {
    let name = node.key.name,
      params = node.value.params,
      body /*: Array<Statement */ = node.value.body.body;

    let method = t.classMethod('method', t.identifier(name), params, t.blockStatement(body));
    method.leadingComments = node.leadingComments;
    return method;
  }


  function parsePolymerProperty(property) /*: ClassProperty */ {
    let name: string = property.key.name,
        attributes = property.value.properties,
        type, value, isFunction, params, readonly = false, decoratorProps = [];

    if(t.isIdentifier(property.value)) {
      type = createTypeAnnotation(property.value.name);
    } else {
      attributes.forEach( (attribute) => {  
        let attr_name: string = attribute.key.name;
        switch(attr_name) {
        case 'type':
          // one of Boolean, Date, Number, String, Array or Object
          type = createTypeAnnotation(attribute.value.name);
          decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.name));
          break;
        case 'value':
          // Default value for the property
          value = attribute.value;
          if(t.isFunctionExpression(attribute.value)) {
            isFunction = true;
            params = [];
          }
          if(type === undefined) {
            type = t.createTypeAnnotationBasedOnTypeof(value);
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
          decoratorProps.push(createDecoratorProperty(attr_name, '\'' + attribute.value.value + '\''));
          break;
        default:
          console.warn('Unexpected property attribute: ', attribute.key.name, 'at line', attribute.loc.start.line);
          decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.value));
        }
      });
    }

    let decorators = [t.decorator(
          t.callExpression(
            t.identifier('property'),
            [t.objectExpression(decoratorProps)]
          )
        )];

    if(isFunction) {
      postConstuctSetters[name] = value.body.body;
      var result = t.ClassProperty(t.identifier(name), undefined, type, decorators);
    } else {
      var result = t.ClassProperty(t.identifier(name), value, type, decorators);
    }

    result.leadingComments = property.leadingComments;
    return result;
  }

  return {
    visitor: {
      CallExpression(path, state) {        
        // For some reason we visit each identifier twice        
        if(path.node.callee.start != start) {
          start = path.node.callee.start;

          if(path.node.callee.name == 'Polymer') {
            let elementName, className, 
                extend, behaviors, hostAttributes,
                properties /*: Array<ClassProperty> */ = [],
                constructor,
                functions /*: Array<ClassMethod>*/ = [];
            
            path.node.arguments[0].properties.forEach(function(config) {
              var key = config.key.name,
                type = config.value.type,
                value = config.value.value;
              switch(key) {
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
                listeners = parsePolymerEventListenerProperties(config.value.properties);
                break;
              default:
                if(t.isFunctionExpression(config.value)) {
                  let method = parseNonPolymerFunction(config)

                  if(method.key.name == 'factoryImpl') {
                    method.key.name = method.kind = 'constructor';
                    constructor = method;
                  } else {
                    // Add observer decorators
                    let functionObserver = observers[method.key.name];
                    if(functionObserver) {
                      if(!method.decorators) { method.decorators = []; }
                        method.decorators.push(functionObserver);
                    }

                    // Add listener decorators
                    let functionListeners = listeners[method.key.name];
                    if(functionListeners) {
                      functionListeners.forEach( (listener) => {
                        if(!method.decorators) { method.decorators = []; }
                        method.decorators.push(listener);
                      });
                    }
                    functions.push(method);
                  }
                } else if (t.isObjectExpression) {
                  properties.push(t.classProperty(t.identifier(key), config.value));
                } else {
                  console.warn("!!!!!!!!!!! Unexpected property:", key + ':', value, type);
                }
              }
            });

            let decorators = [ createDecorator('component', elementName) ];
            if(extend) {
              decorators.push(createDecorator('extend', extend));
            }
            if(hostAttributes) {
              decorators.push(createDecorator('hostAttributes', hostAttributes));
            }
            if(behaviors && state.opts.useBehaviorDecorator) {
              decorators = decorators.concat(behaviors);
            }

            // Add any postConstructorSetters (Polymer properties with a function for `value`)
            let constuctorBody /*: Array<Statement>*/ = constructor ? constructor.body.body : [];

            for(var key in postConstuctSetters) {
              let postConstuctSetter /*: BlockStatement | Expression */ = postConstuctSetters[key];
              constuctorBody.push(t.expressionStatement(
                                    t.AssignmentExpression('=', 
                                      t.memberExpression(t.thisExpression(), t.identifier(key)),
                                      t.callExpression(
                                        t.arrowFunctionExpression([], 
                                          t.blockStatement(postConstuctSetter)
                                        ),
                                        []
                                      )
                                    )
                                  ));
            }
            if(constuctorBody.length) {
              properties.push(constructor || t.classMethod('constructor', t.identifier('constructor'), [], t.blockStatement(constuctorBody)));
            }

            // Find the file's relative path to bower_components
            var filePath = state.file.opts.filename, dots = '';
            while(filePath) {
              filePath = filePath.match(/(.*)\/.*/);
              filePath = filePath && filePath[1];
              if(filePath) {
                try {
                  if(fs.accessSync) {
                    fs.accessSync(filePath + '/bower_components', fs.F_OK);
                  } else {
                    fs.lstatSync(filePath + '/bower_components');
                  }
                  break;
                } catch (e) {
                  dots += '../';
                }
              }
            }
            
            // Write out the TypeScript code
            path.parentPath.parentPath.addComment('leading', '/ <reference path="' + dots + 'bower_components/polymer-ts/polymer-ts.d.ts"/>', true);

            let classDeclaration = t.classDeclaration(
                                            t.identifier(className),
                                            t.memberExpression(t.identifier('polymer'), t.identifier('Base')
                                          ),
                                          t.classBody(properties.concat(functions)),
                                          decorators);

            if(behaviors && !state.opts.useBehaviorDecorator) {
              classDeclaration.implements = behaviors.map( (behavior) => {      
                return t.classImplements(behavior);
              });
            }
            path.parentPath.replaceWith(classDeclaration);

            path.parentPath.insertAfter(t.expressionStatement(
                                            t.callExpression(
                                              t.memberExpression(
                                                t.identifier(className),
                                                t.identifier('register')
                                              ),
                                              []
                                            )
                                        ));
          }
        }
      }
    }
  }
}

function logPath(path) {
  for(var propName in path) {
    if(path.hasOwnProperty(propName) 
      && propName != 'parentPath' && propName != 'parent' 
      && propName != 'hub'
      && propName != 'container') {
      console.log(propName, path[propName]);
    }
  }
}
