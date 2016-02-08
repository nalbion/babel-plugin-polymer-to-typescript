/// <reference path="node.d.ts" />
declare function require(name: string);
require('source-map-support').install();

import fs = require('fs');

export default function({ types: t }) {
	var start = -1,
      observers = {},
      listeners = {},
      postConstuctSetters = {};

  function toDashCase(str: string){
    return str.replace(/([a-z]+)([A-Z])/g, function($0, $1, $2){return $1 + '-' + $2;}).toLowerCase();
  }    

  function toUpperCamel(str: string){
    return str.replace(/^[a-z]|(\-[a-z])/g, function($1){return $1.toUpperCase().replace('-','');});
  }

  function createDecorator(name: string, value) {
      return t.decorator(t.callExpression(t.identifier(name),
              [typeof value == 'string' ? t.stringLiteral(value) : value]));
  }

  function createDecoratorProperty(key: string, value: string) {
    switch(typeof value) {
    case 'object':
      return t.objectProperty(
        t.identifier(key),
        value
      );
    case 'boolean':
      value = value.toString();
    }
    return t.objectProperty(
      t.identifier(key),
      t.identifier(value)
    );
  }

  /** @param type - one of Boolean, Date, Number, String, Array or Object */
  function createTypeAnnotation(type: string, name?: string, elementType = 'any') {
    if (!type) {
      console.info('!!!!!!!!!!!!!!!!!! no type for', name);
      return;
    }
    switch(type.toLowerCase()) {
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
        } else {
          type = type + ' => void';
        }
      } else if (name) {
        let guessedType = guessTypeFromName(name);
        if (guessedType) {
          return createTypeAnnotation(guessedType);
        }
      }


      return t.typeAnnotation(t.genericTypeAnnotation(t.identifier(type)));
    }
  }

  function parsePolymerFunctionSignatureProperties(elements) {
    return elements.reduce( (results, signature) => {
      // join multi-line strings
      let value = '';
      while(t.isBinaryExpression(signature)) {
        // value = ((signature.left.value || signature.left.right.value) + signature.right.value;
        value = signature.right.value + value;
        signature = signature.left;
      }
      value = signature.value + value;

      let match = value.match(/([^\(]+)\(([^\)]+)/),
        functionName = match[1],
        observedProperties = match[2];
      results[functionName] = createDecorator('observe', observedProperties);
      return results;
    }, {});
  }

  function parsePolymerEventListenerProperties(properties) {
    return properties.reduce( (results, property) => {
      let eventName = property.key.value || property.key.name,
          functionName = property.value.value,
          functionEvents = results[functionName];
      if(!functionEvents) {
        functionEvents = results[functionName] = [];
      }
      functionEvents.push(createDecorator('listen', eventName));
      return results;
    }, {});
  }

  function parsePolymerBehaviorReference(useBehaviorDecorator, node) {
    return useBehaviorDecorator ? createDecorator('behavior', node) : node;
  }

  function guessTypeFromName(name: string) {
    var type;
    if (name.match(/^(opt_)?is[A-Z]/)) {
      type = 'boolean';
    } else {
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
          } else if (name.match(/(String|Name)$/)) {
            type = 'string';
          } else if (name.match(/EventTarget$/)) {
            type = 'EventTarget';
          }
      }
    }
    return type;
  }

  function parseNonPolymerFunction(node) {
    let name = node.key.name,
      params = node.value.params,
      body /*: Array<Statement */ = node.value.body.body;

    let method = t.classMethod('method', t.identifier(name), params, t.blockStatement(body));

    // Attempt to guess the types from parameter names
    if (params) {
      params.forEach( (param) => {
        param.optional = !!param.name.match(/^opt/);

        let type = guessTypeFromName(param.name);
        if (type) {
          param.typeAnnotation = createTypeAnnotation(type);
        }
      });
    }

    // Some functions have JSDoc annotations
    // https://developers.google.com/closure/compiler/docs/js-for-compiler#types
    if (node.leadingComments) {
      let typedParams = node.leadingComments[0].value.match(/@param {[^}]+} \S+/g);
      if (typedParams) {
        for (let i = 0; i < typedParams.length; i++) {
          let typedParam = typedParams[i],
              match = typedParam.match(/{[!\?]?([^=}]+)(=?)} (\S+)/),
              paramName = match[3];

          if (params[i] && params[i].name == paramName) {
            parseTypeFromComments(match, paramName, params[i]);
          } else {
            console.warn('param', i, '(' + params[i] + ') !=', paramName);
          }
        }
      }

      method.leadingComments = node.leadingComments;
    }

    return method;
  }

  function parseTypeFromComments(match: RegExpMatchArray, paramName: string, result: any) {
    if (!!match[2]) {
      result.optional = true;
    }

    // remove 'undefined', 'null' and fix '<!'
    let type = match[1].replace(/\b(undefined|null)\b/g, '')
                      .replace(/\|{2,}/g, '|')
                      .replace(/^\||\|$/g, '')
                      .replace(/<!/, '<');

    result.typeAnnotation = createTypeAnnotation(type);
    return result;
  }


  function parsePolymerProperty(property) /*: ClassProperty */ {
    let name: string = property.key.name,
        attributes = property.value.properties,
        type, value, isFunction, params, readonly = false, decoratorProps = [];

    if(t.isIdentifier(property.value)) {
      type = createTypeAnnotation(property.value.name, name);
    } else {
      attributes.forEach( (attribute) => {
        let attr_name: string = attribute.key.name;
        switch(attr_name) {
        case 'type':
          // one of Boolean, Date, Number, String, Array or Object
          type = createTypeAnnotation(attribute.value.name, name);
          decoratorProps.push(createDecoratorProperty(attr_name, attribute.value.name));
          break;
        case 'value':
          // Default value for the property
          value = attribute.value;
          //decoratorProps.push(createDecoratorProperty(attr_name, attribute.value));
          if(t.isFunctionExpression(value)) {
            isFunction = true;
            params = [];
          }
          if(type === undefined && !t.isNullLiteral(value)) {
            if (t.isCallExpression(value)) {
              // TODO: determine actual type
              type = t.typeAnnotation(t.genericTypeAnnotation(t.identifier('object')));
            } else if (t.isFunctionExpression(value)) {
              type = t.typeAnnotation(t.functionTypeAnnotation());
            } else {
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

    let decorators = [t.decorator(
          t.callExpression(
            t.identifier('property'),
            [t.objectExpression(decoratorProps)]
          )
        )];

    if (property.leadingComments) {
      let match = property.leadingComments[0].value.match(/@type {[!\?]?(?!hydrolysis)([^=}]+)(=?)}/);
      if (match) {
        let typeResult = parseTypeFromComments(match, name, {});
        type = typeResult.typeAnnotation;
        if (typeResult.optional) {
          //type.optional = true;
        }
      }
    }

    if(isFunction) {
      postConstuctSetters[name] = value.body.body;
      var result = t.classProperty(t.identifier(name), undefined, type, decorators);
    } else {
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
  function getPathForPolymerFileName(filePath: string, dtsFileName: string): string {
    dtsFileName = dtsFileName.replace(/-impl$/, '');
    var path = polymerPathsByFileName[dtsFileName];

    if(!path) {
      if(verifyPathExists(filePath + dtsFileName + '/' + dtsFileName + '.html')) {
        return dtsFileName;
      }
      path = dtsFileName.match(/[^-]+-[^-]+/)[0];
      if(verifyPathExists(filePath + path + '/' + dtsFileName + '.html')) {
        return path;
      }

      let behavior = dtsFileName.indexOf('-behavior');
      if (behavior > 0 ) {
        return getPathForPolymerFileName(filePath, dtsFileName.substring(0, behavior));
      } else {
        console.info('!!!!!!!!!!!!!!!!!!!!!!!!! failed to find path for', dtsFileName);
      }
    }

    return path;
  }

  function verifyPathExists(filePath): boolean {
    try {
      if(fs.accessSync) {
        fs.accessSync(filePath, fs.F_OK);
      } else {
        fs.lstatSync(filePath);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function addTypeDefinitionReference(path, state, dtsFileName?: string) {
    // skip templatizer behavior, used by iron-list
    if (dtsFileName && dtsFileName.indexOf('-') < 0) { return; }

    // Find the file's relative path to bower_components
    var filePath = state.file.opts.filename, dots = '';
    while(filePath) {
      filePath = filePath.match(/(.*)\/.*/);
      filePath = filePath && filePath[1];
      if(filePath) {
        if(verifyPathExists(filePath + '/bower_components')) {
          break;
        } else {
          dots += '../';
        }
      }
    }

    // Write out the TypeScript code
    if(dtsFileName) {
      let dtsPath = getPathForPolymerFileName(filePath + '/bower_components/', dtsFileName);
      state.file.path.addComment('leading', '/ <reference path="' + dots + 'typings/' + dtsPath + '/' + dtsFileName + '.d.ts"/>', true);
    } else {
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
    let classDeclaration = t.classDeclaration(t.identifier(memberExpression.property.name),
                                              null,
                                              t.classBody([]),
                                              []);
    classDeclaration.implements = arrayExpression.elements.map( (behavior) => {
      if(behavior.property.name != memberExpression.property.name + 'Impl') {
        addTypeDefinitionReference(path, state, toDashCase(behavior.property.name));
      }
      return t.classImplements(behavior.property);
    });
    //classDeclaration.modifiers = [t.absract]
    
    path.parentPath.replaceWith(t.declareModule(t.identifier(memberExpression.object.name),
                                                t.blockStatement([classDeclaration])));
  }

  function parsePolymerClass(objectExpression, path, state, memberExpression?, isInterface = false) {
    let className, elementName,
                extend, behaviors, hostAttributes,
                properties /*: Array<ClassProperty> */ = [],
                constructor,
                functions /*: Array<ClassMethod>*/ = [];

    objectExpression.properties.forEach( (config) => {
      switch(config.key.name) {
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
        if(t.isObjectMethod(config)) {
          functions.push(t.classMethod(config.kind, config.key, config.params, config.body, config.computed, config.static));
        } else if(t.isFunctionExpression(config.value)) {
          let method = parseNonPolymerFunction(config);

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
          properties.push(t.classProperty(t.identifier(config.key.name), config.value));
        } else {
          console.warn("!!!!!!!!!!! Unexpected property:", config.key + ':', config.value);
        }
      }
    });

    let decorators = [];
    if(elementName) {
      decorators.push(createDecorator('component', elementName));
      if(extend) {
        decorators.push(createDecorator('extend', extend));
      }
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

    addTypeDefinitionReference(path, state);
    if(behaviors) {
      behaviors.forEach( (behavior) => {
        addTypeDefinitionReference(path, state, toDashCase(behavior.property.name));
      });
    }

    if(memberExpression) {
      className = memberExpression.property.name;
    }

    let classDeclaration;
    if (isInterface) {
      properties.forEach( (prop) => {
        delete prop.decorators;
        delete prop.value;
      });
      functions.forEach( (prop) => {
        delete prop.decorators;
        delete prop.body;
      });
      classDeclaration = t.interfaceDeclaration(t.identifier(className), null /*typeParameters*/,
          [], t.classBody(properties.concat(functions)
                        .filter( (prop) => {
                          let name = prop.key.value || prop.key.name;
                          return name[0] != '_';
                        })));
    } else {
      classDeclaration = t.classDeclaration(t.identifier(className),
          t.memberExpression(t.identifier('polymer'), t.identifier('Base')),
          t.classBody(properties.concat(functions)
                        .filter( (prop) => {
                          let name = prop.key.value || prop.key.name;
                          return name[0] != '_';
                        })),
          decorators);
    }

    if(behaviors && !state.opts.useBehaviorDecorator) {
      classDeclaration.implements = behaviors.map( (behavior) => {
        return t.classImplements(behavior);
      });
    }

    if(memberExpression) {
//TODO: export class, module on same line as Polymer
//      let module = t.declareModule(t.identifier(memberExpression.object.name),
//                                                  t.blockStatement([classDeclaration]));
      let module = t.blockStatement([classDeclaration]);

      path.parentPath.replaceWithMultiple([t.identifier('module'), t.identifier('Polymer'), module]);
    } else {
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

  function evaluateFunctionExpression(functionExpression) {
    var namedStatements = {},
      result;

    functionExpression.body.body.forEach( (statement) => {
      if (t.isReturnStatement(statement)) {
        result = statement.argument;        
      } else if (t.isFunctionDeclaration(statement)) {
        namedStatements[statement.id.name] = t.functionExpression(null, statement.params, statement.body);
      }
    });

    result.properties.forEach( (property) => {
      if (t.isIdentifier(property.value)) {
        let statement = namedStatements[property.value.name];
        if (statement !== undefined) {
          property.value = statement;
        }
      }
    });

    return result;
  }

  return {
    visitor: {
      CallExpression(path, state) {
        observers = {};
        listeners = {};
        postConstuctSetters = {};

        // For some reason we visit each identifier twice
        if(path.node.callee.start != start) {
          start = path.node.callee.start;

          if (!path.node.callee.name && t.isFunctionExpression(path.node.callee)) {
            // anonymous function - won't be able to generate .d.ts
            var bodyNodes = path.node.callee.body.body;
            path.replaceWith(bodyNodes[0]);
            for (let i = 1; i < bodyNodes.length; i++) {
              path.parentPath.insertAfter(bodyNodes[i]);
            }
          } else if (path.node.callee.name == 'Polymer') {
            let memberExpression = t.isAssignmentExpression(path.parent) &&
                                    t.isMemberExpression(path.parent.left) ?
                                    path.parent.left : undefined;
                //module = path.parent.left.object.name;
                // path.parent.left.property.name

            parsePolymerClass(path.node.arguments[0], path, state, memberExpression, false);
          }
        }
      },

      AssignmentExpression(path, state) {
        if(t.isMemberExpression(path.node.left)) {
          if(path.node.left.object.name == 'Polymer') {
            let className = path.node.left.object.name + '.' + path.node.left.property.name;
            console.info('Parsing Polymer behavior', className, 'in', state.file.opts.filename);
            if(t.isCallExpression(path.node.right)) {
console.info('.......... Call within assignment', state.file.opts.filename);
              //if(path.node.right.callee.name == 'Polymer') {
              //  parsePolymerClass(path.node.right.arguments[0], path, state); //, path.node.left);
              //} else if(t.isFunctionExpression(path.node.right.callee)) {
              //  let expression = evaluateFunctionExpression(path.node.right.callee);
              //  parsePolymerClass(expression, path, state, path.node.left);
              //}
            } else if(t.isObjectExpression(path.node.right)) {
              parsePolymerClass(path.node.right, path, state, path.node.left, true);
            } else if(t.isArrayExpression(path.node.right)) {
              parsePolymerBehaviorDefinition(path.node.right, path, state, path.node.left);
            }
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
