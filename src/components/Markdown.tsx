import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

/**
 * Lightweight, dependency-free Markdown renderer for React Native + Web.
 * Supports headings, bold/italic, inline code, fenced code blocks, ordered/
 * unordered lists, blockquotes, horizontal rules and links. Built in-house so
 * the offline bundle stays small and works identically on device and on the
 * Playwright web build.
 */

const palette = {
  text: '#e2e8f0',
  heading: '#f8fafc',
  muted: '#94a3b8',
  accent: '#06b6d4',
  codeBg: 'rgba(2, 6, 23, 0.7)',
  codeText: '#5eead4',
  border: '#1e293b',
  quoteBar: '#334155',
};

type InlineToken =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: string }
  | { t: 'italic'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; v: string; href: string };

// Tokenise a single line of inline markdown (bold/italic/code/link).
function parseInline(line: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Order matters: code first, then link, then bold, then italic.
  const re = /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)/;
  let rest = line;
  while (rest.length > 0) {
    const m = rest.match(re);
    if (!m || m.index === undefined) {
      tokens.push({ t: 'text', v: rest });
      break;
    }
    if (m.index > 0) tokens.push({ t: 'text', v: rest.slice(0, m.index) });
    const tok = m[0];
    if (tok.startsWith('`')) {
      tokens.push({ t: 'code', v: tok.slice(1, -1) });
    } else if (tok.startsWith('[')) {
      const lm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      tokens.push({ t: 'link', v: lm[1], href: lm[2] });
    } else if (tok.startsWith('**')) {
      tokens.push({ t: 'bold', v: tok.slice(2, -2) });
    } else {
      tokens.push({ t: 'italic', v: tok.slice(1, -1) });
    }
    rest = rest.slice(m.index + tok.length);
  }
  return tokens;
}

function Inline({ line }: { line: string }) {
  const tokens = parseInline(line);
  return (
    <Text>
      {tokens.map((tk, i) => {
        switch (tk.t) {
          case 'bold':
            return <Text key={i} style={md.bold}>{tk.v}</Text>;
          case 'italic':
            return <Text key={i} style={md.italic}>{tk.v}</Text>;
          case 'code':
            return <Text key={i} style={md.inlineCode}>{tk.v}</Text>;
          case 'link':
            return (
              <Text key={i} style={md.link} onPress={() => Linking.openURL(tk.href).catch(() => {})}>
                {tk.v}
              </Text>
            );
          default:
            return <Text key={i}>{tk.v}</Text>;
        }
      })}
    </Text>
  );
}

export default function Markdown({ children }: { children: string }) {
  const lines = (children ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      blocks.push(
        <View key={key++} style={md.codeBlock}>
          {!!lang && <Text style={md.codeLang}>{lang.toUpperCase()}</Text>}
          <Text style={md.codeBlockText}>{buf.join('\n')}</Text>
        </View>
      );
      continue;
    }

    // Horizontal rule
    if (/^\s*([-*_])\1\1+\s*$/.test(line)) {
      blocks.push(<View key={key++} style={md.hr} />);
      i++;
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const style = level === 1 ? md.h1 : level === 2 ? md.h2 : md.h3;
      blocks.push(
        <Text key={key++} style={style}>
          <Inline line={h[2]} />
        </Text>
      );
      i++;
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <View key={key++} style={md.quote}>
          <Text style={md.quoteText}><Inline line={buf.join(' ')} /></Text>
        </View>
      );
      continue;
    }

    // Lists (grouped)
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const items: { ordered: boolean; marker: string; text: string }[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        const om = lines[i].match(/^\s*(\d+)\.\s+(.*)$/);
        if (om) {
          items.push({ ordered: true, marker: `${om[1]}.`, text: om[2] });
        } else {
          const um = lines[i].match(/^\s*[-*+]\s+(.*)$/)!;
          items.push({ ordered: false, marker: '•', text: um[1] });
        }
        i++;
      }
      blocks.push(
        <View key={key++} style={md.list}>
          {items.map((it, idx) => (
            <View key={idx} style={md.listItem}>
              <Text style={[md.bullet, it.ordered && md.bulletOrdered]}>{it.marker}</Text>
              <Text style={md.listText}><Inline line={it.text} /></Text>
            </View>
          ))}
        </View>
      );
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph (merge consecutive non-empty, non-special lines)
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^\s*([-*+]|\d+\.)\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith('```') &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push(
      <Text key={key++} style={md.p}>
        <Inline line={buf.join(' ')} />
      </Text>
    );
  }

  return <View>{blocks}</View>;
}

const md = StyleSheet.create({
  p: { fontSize: 14, color: palette.text, lineHeight: 23, marginBottom: 10 },
  bold: { fontWeight: '800', color: palette.heading },
  italic: { fontStyle: 'italic' },
  link: { color: palette.accent, textDecorationLine: 'underline' },
  inlineCode: {
    fontFamily: 'monospace', fontSize: 12.5, color: palette.codeText,
    backgroundColor: palette.codeBg,
  },
  h1: { fontSize: 21, fontWeight: '900', color: palette.heading, marginTop: 6, marginBottom: 10, letterSpacing: 0.3 },
  h2: { fontSize: 17, fontWeight: '800', color: palette.heading, marginTop: 6, marginBottom: 8 },
  h3: { fontSize: 14.5, fontWeight: '800', color: palette.accent, marginTop: 4, marginBottom: 6, letterSpacing: 0.5 },
  codeBlock: {
    backgroundColor: palette.codeBg, borderWidth: 1, borderColor: palette.border,
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  codeLang: { fontSize: 9, color: palette.muted, fontFamily: 'monospace', letterSpacing: 1.5, marginBottom: 6 },
  codeBlockText: { fontFamily: 'monospace', fontSize: 12.5, color: palette.codeText, lineHeight: 19 },
  hr: { height: 1, backgroundColor: palette.border, marginVertical: 14 },
  quote: {
    borderLeftWidth: 3, borderLeftColor: palette.quoteBar, paddingLeft: 12,
    marginBottom: 10, marginLeft: 2,
  },
  quoteText: { fontSize: 14, color: palette.muted, fontStyle: 'italic', lineHeight: 22 },
  list: { marginBottom: 10, gap: 6 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  bullet: { fontSize: 14, color: palette.accent, lineHeight: 22, minWidth: 16 },
  bulletOrdered: { fontFamily: 'monospace', fontWeight: '700', fontSize: 13 },
  listText: { flex: 1, fontSize: 14, color: palette.text, lineHeight: 22 },
});
