require('./common_epub.js').buildEpub({
  srcMd: '短见_排版版.md',
  epubOut: '短见.epub',
  bookTitle: '短见',
  bookTitleEn: 'SHORT-SIGHTED',
  bookSubtitle: '路易斯安那系列·中篇',
  bookSeriesEn: 'CALL OF CTHULHU · SOUTHERN LOUISIANA SERIES · PART II',
  creator: '歌味觉死',
  editor: 'r0k1s#i',
  description: '克苏鲁跑团 Replay《短见》路易斯安那系列·中篇，OCR 校对整理版。',
  bilibiliUrl: 'https://www.bilibili.com/video/BV1sY4y1Q7Gv',
  coverImage: 'tools/images/cover_short_sighted.png',
  authorAvatar: 'tools/images/author_avatar.jpg',
  disclaimer: '视频由2021年的网团大面积魔改而成自娱自乐，切勿当真。视频可能包含各类令人不适的描述，请积极回避。',
  images: [
    { src: 'tools/images/carol_rigg_1.png', name: 'carol_rigg_1.png' },
    { src: 'tools/images/carol_rigg_2.png', name: 'carol_rigg_2.png' },
  ],
});
