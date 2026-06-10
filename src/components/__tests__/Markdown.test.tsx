import { describe, it, expect, vi } from 'vitest';
import { View, Text, Linking } from 'react-native';
import Markdown from '../Markdown';

// Mock react-native
vi.mock('react-native', () => {
  const mockOpenURL = vi.fn().mockResolvedValue(true);
  const ViewComponent = ({ children, style }: any) => ({ type: 'View', props: { style, children } });
  const TextComponent = ({ children, style, onPress }: any) => ({ type: 'Text', props: { style, onPress, children } });
  
  // Set names so name checks work if needed
  Object.defineProperty(ViewComponent, 'name', { value: 'View' });
  Object.defineProperty(TextComponent, 'name', { value: 'Text' });

  return {
    View: ViewComponent,
    Text: TextComponent,
    Linking: {
      openURL: mockOpenURL,
    },
    StyleSheet: {
      create: (s: any) => s,
    },
  };
});

describe('Markdown.tsx tests', () => {
  it('renders simple paragraph', () => {
    const res = Markdown({ children: 'hello world' });
    expect(res.type).toBe(View);
    
    // Structure check: View -> p Text -> Inline
    const p = res.props.children[0];
    expect(p.type).toBe(Text);
    expect(p.props.style.fontSize).toBe(14); // p style
    
    const inline = p.props.children;
    expect(inline.type.name).toBe('Inline');
    
    const inlineRes = inline.type(inline.props);
    expect(inlineRes.type).toBe(Text);
    expect(inlineRes.props.children[0].type).toBe(Text);
    expect(inlineRes.props.children[0].props.children).toBe('hello world');
  });

  it('renders headings H1, H2, and H3', () => {
    const res = Markdown({
      children: '# Title 1\n## Title 2\n### Title 3',
    });
    
    const h1 = res.props.children[0];
    expect(h1.type).toBe(Text);
    expect(h1.props.style.fontSize).toBe(21);
    
    const h2 = res.props.children[1];
    expect(h2.type).toBe(Text);
    expect(h2.props.style.fontSize).toBe(17);
    
    const h3 = res.props.children[2];
    expect(h3.type).toBe(Text);
    expect(h3.props.style.fontSize).toBe(14.5);
  });

  it('renders fenced code blocks', () => {
    const res = Markdown({
      children: '```typescript\nconst a = 123;\nconsole.log(a);\n```',
    });
    
    const codeBlock = res.props.children[0];
    expect(codeBlock.type).toBe(View);
    expect(codeBlock.props.style.borderRadius).toBe(8);

    const langText = codeBlock.props.children[0];
    expect(langText.type).toBe(Text);
    expect(langText.props.children).toBe('TYPESCRIPT');

    const codeText = codeBlock.props.children[1];
    expect(codeText.type).toBe(Text);
    expect(codeText.props.children).toBe('const a = 123;\nconsole.log(a);');
  });

  it('renders fenced code block without lang', () => {
    const res = Markdown({
      children: '```\njust code\n```',
    });
    
    const codeBlock = res.props.children[0];
    expect(codeBlock.props.children[0]).toBe(false); // language title falsey
    expect(codeBlock.props.children[1].props.children).toBe('just code');
  });

  it('renders blockquotes', () => {
    const res = Markdown({
      children: '> This is a blockquote\n> containing two lines',
    });
    
    const quote = res.props.children[0];
    expect(quote.type).toBe(View);
    expect(quote.props.style.borderLeftWidth).toBe(3);

    const quoteText = quote.props.children;
    expect(quoteText.type).toBe(Text);
    expect(quoteText.props.style.fontStyle).toBe('italic');
  });

  it('renders horizontal rules', () => {
    const res = Markdown({
      children: '---\n***\n___',
    });
    
    expect(res.props.children.length).toBe(3);
    expect(res.props.children[0].type).toBe(View);
    expect(res.props.children[0].props.style.height).toBe(1);
  });

  it('renders lists (unordered and ordered)', () => {
    const res = Markdown({
      children: '- Item 1\n* Item 2\n+ Item 3\n1. First\n2. Second',
    });

    const lists = res.props.children;
    expect(lists.length).toBe(1);

    const listBlock = lists[0];
    expect(listBlock.type).toBe(View);
    expect(listBlock.props.children.length).toBe(5);
    expect(listBlock.props.children[0].props.children[0].props.children).toBe('•');
    expect(listBlock.props.children[3].props.children[0].props.children).toBe('1.');
  });

  it('renders bold, italic, inline code, and links', async () => {
    const res = Markdown({
      children: 'Text **bold** text *italic* and _italic_ and `code` and [link](https://qvac.tether.io)',
    });
    
    const p = res.props.children[0];
    const inline = p.props.children;
    const inlineRes = inline.type(inline.props);
    const tokens = inlineRes.props.children;

    // Check inline parsing tokens
    expect(tokens[0].props.children).toBe('Text ');
    
    expect(tokens[1].type).toBe(Text);
    expect(tokens[1].props.style.fontWeight).toBe('800');
    expect(tokens[1].props.children).toBe('bold');

    expect(tokens[2].props.children).toBe(' text ');

    expect(tokens[3].type).toBe(Text);
    expect(tokens[3].props.style.fontStyle).toBe('italic');
    expect(tokens[3].props.children).toBe('italic');

    expect(tokens[4].props.children).toBe(' and ');

    expect(tokens[5].type).toBe(Text);
    expect(tokens[5].props.style.fontStyle).toBe('italic');
    expect(tokens[5].props.children).toBe('italic');

    expect(tokens[6].props.children).toBe(' and ');

    expect(tokens[7].type).toBe(Text);
    expect(tokens[7].props.style.fontFamily).toBe('monospace');
    expect(tokens[7].props.children).toBe('code');

    expect(tokens[8].props.children).toBe(' and ');

    const link = tokens[9];
    expect(link.type).toBe(Text);
    expect(link.props.style.color).toBe('#06b6d4');
    expect(link.props.children).toBe('link');

    // Trigger onPress
    link.props.onPress();
    expect(Linking.openURL).toHaveBeenCalledWith('https://qvac.tether.io');

    // Trigger onPress with no catch block throwing
    const brokenLink = tokens[9];
    vi.mocked(Linking.openURL).mockRejectedValueOnce(new Error('error'));
    brokenLink.props.onPress();
  });

  it('handles edge case inline markdown', () => {
    // Starts directly with inline token (m.index === 0)
    const res1 = Markdown({ children: '`code` at start' });
    const p1 = res1.props.children[0];
    const inlineRes1 = p1.props.children.type(p1.props.children.props);
    expect(inlineRes1.props.children[0].props.children).toBe('code');

    // Malformed link that doesn't match the second regex
    const res2 = Markdown({ children: '[badlink](broken' });
    const p2 = res2.props.children[0];
    const inlineRes2 = p2.props.children.type(p2.props.children.props);
    expect(inlineRes2.props.children[0].props.children).toBe('[badlink](broken');
  });

  it('handles empty/null children and empty list item texts', () => {
    // Null children fallback
    const res1 = Markdown({ children: null as any });
    expect(res1.props.children.length).toBe(0);

    // List item without text
    const res2 = Markdown({ children: '- ' });
    const list = res2.props.children[0];
    expect(list.type).toBe(View);
    
    const listItem = list.props.children[0];
    expect(listItem.type).toBe(View);

    const listTextWrapper = listItem.props.children[1];
    expect(listTextWrapper.type).toBe(Text);

    const inlineVal = listTextWrapper.props.children;
    expect(inlineVal.type.name).toBe('Inline');
    expect(inlineVal.props.line).toBe('');
  });
});
