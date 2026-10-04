// Page scripts are classic browser scripts with everything declared inside one
// block, so a test cannot import a single helper from them. This lifts one
// declaration out of the source by matching its braces, for evaluation in a
// node:vm context with whatever browser globals the helper needs.
//
// Quoted strings are skipped while counting; template literals and regex
// literals are not, so it suits helpers whose braces are balanced in those too.
export function extractDeclaration(source, name) {
  const patterns = [
    new RegExp(`\\bconst ${name} = `),
    new RegExp(`\\bfunction ${name}\\(`),
  ];
  const match = patterns.map((pattern) => source.match(pattern)).find(Boolean);
  if (!match) {
    throw new Error(`declaration of ${name} not found`);
  }
  const start = match.index;
  const arrow = source.indexOf('=>', start);
  const bodyFrom = match[0].startsWith('const') && arrow !== -1 ? arrow : start;
  const open = source.indexOf('{', bodyFrom);
  let depth = 0;
  let quote = '';
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (char === '\\') {
        index += 1;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '\'' || char === '"') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const end = source[index + 1] === ';' ? index + 2 : index + 1;
        return source.slice(start, end);
      }
    }
  }
  throw new Error(`unbalanced braces after ${name}`);
}
