// Stage B (畅梦人): intermediate markdown -> EPUB. Book-specific config only;
// the actual rendering/packaging engine lives in common_epub.js.
require('./common_epub.js').buildEpub({
  srcMd: '畅梦人_排版版.md',
  epubOut: '畅梦人.epub',
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
});
