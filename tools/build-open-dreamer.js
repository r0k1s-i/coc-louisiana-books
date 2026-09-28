// Stage B (畅梦人): intermediate markdown -> EPUB. Book-specific config only;
// the actual rendering/packaging engine lives in common_epub.js.
require('./common_epub.js').buildEpub({
  srcMd: 'open-dreamer.md',
  epubOut: '畅梦人.epub',
  bookId: 'urn:uuid:c61e0305-fec8-45d1-a77b-8ec37f5290c8',
  bookTitle: '畅梦人',
  bookTitleEn: 'OPEN DREAMER',
  bookSubtitle: '路易斯安那系列·下篇',
  bookSeriesEn: 'CALL OF CTHULHU · SOUTHERN LOUISIANA SERIES · PART III',
  creator: '歌味觉死',
  editor: 'r0k1s#i',
  description: '克苏鲁跑团 Replay《畅梦人》路易斯安那系列·下篇，全15集。',
  bilibiliUrl: 'https://www.bilibili.com/video/BV1K2TbzFEVB',
  coverImage: 'tools/images/cover_open_dreamer.png',
  authorAvatar: 'tools/images/author_avatar.jpg',
  disclaimer: '视频由2023年的网团大面积魔改而成自娱自乐，切勿当真。视频可能包含各类令人不适的描述，请积极回避。',
  appendices: ['chasing-stars-talk.md', 'open-dreamer-credits.md'],
  imageDirs: [
    { src: 'tools/images/chasing-stars-talk', name: 'chasing-stars-talk' },
    { src: 'tools/images/open-dreamer', name: 'open-dreamer' },
  ],
});
