export function oneSqlStatementPerLine(source: string) {
  const uncommented = source.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('--')).join('\n')
  const statements: string[] = []
  let current = ''
  let quote = ''

  for (let index = 0; index < uncommented.length; index += 1) {
    const character = uncommented[index]
    if (quote) {
      current += character
      if (character === quote) {
        if (uncommented[index + 1] === quote) {
          current += uncommented[index + 1]
          index += 1
        } else {
          quote = ''
        }
      }
    } else if (character === "'" || character === '"' || character === '`') {
      quote = character
      current += character
    } else if (character === ';') {
      if (current.trim()) statements.push(current.trim())
      current = ''
    } else if (/\s/.test(character)) {
      if (current && !current.endsWith(' ')) current += ' '
    } else {
      current += character
    }
  }

  if (current.trim()) statements.push(current.trim())
  return statements.join('\n')
}
