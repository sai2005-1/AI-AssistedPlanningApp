import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const files = []
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(file)
    else if (/\.[cm]?[jt]sx?$/.test(file)) files.push(file)
  }
}
walk('src')
walk('scripts')
const testFile = /\.(test|spec)\.[cm]?[jt]sx?$/
const violations = new Set()
for (const file of files.filter((file) => !testFile.test(file))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  )
  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      /^(vitest|@jest\/globals|node:test|@testing-library\/)/.test(
        node.moduleSpecifier.text,
      )
    )
      violations.add(file)
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['describe', 'it', 'test', 'suite'].includes(node.expression.text)
    )
      violations.add(file)
    ts.forEachChild(node, visit)
  }
  visit(source)
}
if (violations.size) {
  console.error('Move embedded tests into .test or .spec files:', [...violations])
  process.exitCode = 1
} else {
  console.log(
    `Test isolation passed: ${files.filter((file) => testFile.test(file)).length} dedicated test files; no embedded tests.`,
  )
}
