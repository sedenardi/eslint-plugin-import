import path from 'path'

import resolve from 'eslint-module-utils/resolve'
import { isBuiltIn, isExternalModuleMain, isScopedMain } from '../core/importType'
import isStaticRequire from '../core/staticRequire'
import docsUrl from '../docsUrl'

const enumValues = { enum: [ 'always', 'ignorePackages', 'never' ] }
const patternProperties = {
  type: 'object',
  patternProperties: { '.*': enumValues },
}
const properties = {
  type: 'object',
  properties: {
    'pattern': patternProperties,
    'ignorePackages': { type: 'boolean' },
  },
}

function buildProperties(context) {

    const result = {
      defaultConfig: 'never',
      pattern: {},
      ignorePackages: false,
      commonjs: false,
    }

    context.options.forEach(obj => {

      // If this is a string, set defaultConfig to its value
      if (typeof obj === 'string') {
        result.defaultConfig = obj
        return
      }

      // If this is not the new structure, transfer all props to result.pattern
      if (obj.pattern === undefined && obj.ignorePackages === undefined) {
        Object.assign(result.pattern, obj)
        return
      }

      // If pattern is provided, transfer all props
      if (obj.pattern !== undefined) {
        Object.assign(result.pattern, obj.pattern)
      }

      // If ignorePackages is provided, transfer it to result
      if (obj.ignorePackages !== undefined) {
        result.ignorePackages = obj.ignorePackages
      }

      // If commonjs is provided, transfer it to result
      if (obj.commonjs !== undefined) {
        result.commonjs = obj.commonjs
      }
    })

    return result
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      url: docsUrl('extensions'),
    },

    schema: {
      anyOf: [
        {
          type: 'array',
          items: [enumValues],
          additionalItems: false,
        },
        {
          type: 'array',
          items: [
            enumValues,
            properties,
          ],
          additionalItems: false,
        },
        {
          type: 'array',
          items: [properties],
          additionalItems: false,
        },
        {
          type: 'array',
          items: [patternProperties],
          additionalItems: false,
        },
        {
          type: 'array',
          items: [
            enumValues,
            patternProperties,
          ],
          additionalItems: false,
        },
      ],
    },
  },

  create: function (context) {

    const props = buildProperties(context)

    function getModifier(extension) {
      return props.pattern[extension] || props.defaultConfig
    }

    function isUseOfExtensionRequired(extension, isPackageMain) {
      return getModifier(extension) === 'always' && (!props.ignorePackages || !isPackageMain)
    }

    function isUseOfExtensionForbidden(extension) {
      return getModifier(extension) === 'never'
    }

    function isResolvableWithoutExtension(file) {
      const extension = path.extname(file)
      const fileWithoutExtension = file.slice(0, -extension.length)
      const resolvedFileWithoutExtension = resolve(fileWithoutExtension, context)

      return resolvedFileWithoutExtension === resolve(file, context)
    }

    function checkFileExtension(importPath, node) {
      // don't enforce anything on builtins
      if (isBuiltIn(importPath, context.settings)) return

      const resolvedPath = resolve(importPath, context)

      // get extension from resolved path, if possible.
      // for unresolved, use source value.
      const extension = path.extname(resolvedPath || importPath).substring(1)

      // determine if this is a module
      const isPackageMain = isExternalModuleMain(importPath, context.settings)
        || isScopedMain(importPath)

      if (!extension || !importPath.endsWith(`.${extension}`)) {
        const extensionRequired = isUseOfExtensionRequired(extension, isPackageMain)
        const extensionForbidden = isUseOfExtensionForbidden(extension)
        if (extensionRequired && !extensionForbidden) {
          context.report({
            node,
            message:
              `Missing file extension ${extension ? `"${extension}" ` : ''}for "${importPath}"`,
          })
        }
      } else if (extension) {
        if (isUseOfExtensionForbidden(extension) && isResolvableWithoutExtension(importPath)) {
          context.report({
            node,
            message: `Unexpected use of file extension "${extension}" for "${importPath}"`,
          })
        }
      }
    }

    function checkImportFileExtension(node) {
      const { source } = node

      // bail if the declaration doesn't have a source, e.g. "export { foo };"
      if (!source) return

      const importPath = source.value

      checkFileExtension(importPath, source)
    }

    function checkCommonJSFileExtension(node) {
      if (!props.commonjs) return

      if (!isStaticRequire(node)) return

      const importPath = node.arguments[0].value

      checkFileExtension(importPath, node)
    }

    return {
      ImportDeclaration: checkImportFileExtension,
      ExportNamedDeclaration: checkImportFileExtension,
      CallExpression: checkCommonJSFileExtension,
    }
  },
}
