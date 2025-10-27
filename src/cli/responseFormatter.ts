import kleur from "kleur";

export class ResponseFormatter {
  static formatResponse(content: string): string {
    const lines = content.split('\n');
    const formatted: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      // Format headers (lines starting with #)
      if (trimmed.startsWith('# ')) {
        formatted.push(kleur.bold().blue(line));
      } else if (trimmed.startsWith('## ')) {
        formatted.push(kleur.bold().cyan(line));
      } else if (trimmed.startsWith('### ')) {
        formatted.push(kleur.bold().white(line));
      }
      // Format bullet points
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const bulletLine = line.replace(/^(\s*)([-*])\s/, '$1' + kleur.green('•') + ' ');
        formatted.push(bulletLine);
      }
      // Format numbered lists
      else if (/^\s*\d+\.\s/.test(trimmed)) {
        const numberedLine = line.replace(/^(\s*)(\d+)\.\s/, '$1' + kleur.blue('$2.') + ' ');
        formatted.push(numberedLine);
      }
      // Format code blocks
      else if (trimmed.startsWith('```')) {
        formatted.push(kleur.gray(line));
      }
      // Format inline code with backticks
      else if (trimmed.includes('`')) {
        const codeLine = line.replace(/`([^`]+)`/g, kleur.yellow('`$1`'));
        formatted.push(codeLine);
      }
      // Format file paths or commands (look for common patterns)
      else if (trimmed.includes('.ts') || trimmed.includes('.js') || trimmed.includes('.json') || trimmed.includes('.md')) {
        const pathLine = line.replace(/(\w+\.\w+)/g, kleur.cyan('$1'));
        formatted.push(pathLine);
      }
      // Format success/error indicators
      else if (trimmed.includes('✅') || trimmed.includes('SUCCESS') || trimmed.toLowerCase().includes('completed')) {
        formatted.push(kleur.green(line));
      } else if (trimmed.includes('❌') || trimmed.includes('ERROR') || trimmed.toLowerCase().includes('failed')) {
        formatted.push(kleur.red(line));
      } else if (trimmed.includes('⚠️') || trimmed.includes('WARNING') || trimmed.toLowerCase().includes('warning')) {
        formatted.push(kleur.yellow(line));
      }
      // Regular lines
      else {
        formatted.push(line);
      }
    }
    
    return formatted.join('\n');
  }

  static createResponseBox(content: string, title?: string): string {
    const lines = content.split('\n');
    const maxWidth = Math.min(process.stdout.columns - 4 || 76, 100);
    
    // Wrap long lines
    const wrappedLines: string[] = [];
    for (const line of lines) {
      if (ResponseFormatter.stripAnsi(line).length <= maxWidth - 4) {
        wrappedLines.push(line);
      } else {
        // Simple word wrapping
        const words = line.split(' ');
        let currentLine = '';
        
        for (const word of words) {
          if ((currentLine + word).length <= maxWidth - 4) {
            currentLine += (currentLine ? ' ' : '') + word;
          } else {
            if (currentLine) wrappedLines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine) wrappedLines.push(currentLine);
      }
    }
    
    const width = Math.min(maxWidth, Math.max(...wrappedLines.map(line => ResponseFormatter.stripAnsi(line).length)) + 4);
    
    const topBorder = kleur.gray('+' + '-'.repeat(width - 2) + '+');
    const bottomBorder = kleur.gray('+' + '-'.repeat(width - 2) + '+');
    
    const boxedLines: string[] = [];
    
    // Add title if provided
    if (title) {
      const titleLine = kleur.bold().white(title);
      const titlePadding = width - ResponseFormatter.stripAnsi(titleLine).length - 3;
      boxedLines.push(kleur.gray('| ') + titleLine + ' '.repeat(titlePadding) + kleur.gray('|'));
      boxedLines.push(kleur.gray('| ') + ' '.repeat(width - 3) + kleur.gray('|')); // Empty line
    }
    
    // Add content lines
    for (const line of wrappedLines) {
      const padding = width - ResponseFormatter.stripAnsi(line).length - 3;
      boxedLines.push(kleur.gray('| ') + line + ' '.repeat(Math.max(0, padding)) + kleur.gray('|'));
    }
    
    return [topBorder, ...boxedLines, bottomBorder].join('\n');
  }
  
  static stripAnsi(str: string): string {
    return str.replace(/\u001b\[[0-9;]*m/g, '');
  }
  
  static formatTaskComplete(summary?: string): string {
    const lines = [
      kleur.green('✅ Task completed successfully!')
    ];
    
    if (summary) {
      lines.push('');
      lines.push(kleur.white('Summary:'));
      lines.push(kleur.gray(summary));
    }
    
    return ResponseFormatter.createResponseBox(lines.join('\n'), '🎉 Success');
  }
}