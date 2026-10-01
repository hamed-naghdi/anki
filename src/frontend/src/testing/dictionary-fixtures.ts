import type {
  DictionaryEntry,
  DictionarySearchResult,
} from '../app/core/dictionary/dictionary.models';

/** A Longman "make" entry trimmed to the shapes the editor cares about. */
export const makeEntry: DictionaryEntry = {
  provider: 'longman',
  headword: 'make',
  partOfSpeech: 'verb',
  homographNumber: '1',
  pronunciations: [
    {
      british: [{ ipa: 'meɪk', audioUrl: 'https://example.test/uk.mp3' }],
      american: [{ ipa: 'meɪk', audioUrl: 'https://example.test/us.mp3' }],
    },
  ],
  inflectionForms: [{ label: 'past tense', form: 'made' }],
  senses: [
    {
      definition: 'to produce something',
      grammar: 'transitive',
      synonyms: [],
      antonyms: [],
      examples: [
        {
          sourceType: 'LongmanExample',
          segments: [{ text: 'I made a ' }, { text: 'box', isEmphasized: true }, { text: '.' }],
          audioUrl: 'https://example.test/ex.mp3',
        },
        {
          sourceType: 'LongmanGrammarExample',
          pattern: 'make somebody something',
          examples: [{ sourceType: 'LongmanExample', segments: [{ text: 'He made her a toy.' }] }],
        },
        {
          sourceType: 'LongmanCollectionExample',
          collection: 'make a hole',
          glossary: 'damage it',
          examples: [
            { sourceType: 'LongmanExample', segments: [{ text: 'Make a hole in the paper.' }] },
            { sourceType: 'LongmanExample', segments: [{ text: 'The cup made a mark.' }] },
          ],
        },
        { sourceType: 'LongmanGrammarExample', pattern: 'English-made etc', examples: [] },
      ],
    },
    { definition: 'to cause', synonyms: ['cause'], antonyms: [], examples: [] },
  ],
};

export const makeSearch: DictionarySearchResult = {
  word: 'make',
  results: [
    { source: 'Longman', entries: [makeEntry] },
    { source: 'Oxford', entries: [], error: 'not found' },
  ],
};
