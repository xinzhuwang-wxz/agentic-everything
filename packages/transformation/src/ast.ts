import ts from 'typescript';
export function parse(path: string, text: string): ts.SourceFile {
  const result = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const diagnostics = (result as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
  if (diagnostics.length) throw new Error('Source syntax is unsupported: ' + path);
  return result;
}
