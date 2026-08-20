import { Extension, textInputRule } from '@tiptap/core';

// Notion-style auto-replacement: '->' becomes '→' while typing.
// Input rules are skipped inside code blocks / inline code automatically.
export const SmartArrows = Extension.create({
  name: 'smartArrows',
  addInputRules() {
    return [
      textInputRule({ find: /->$/, replace: '→' }),
      textInputRule({ find: /<-$/, replace: '←' }),
    ];
  },
});
