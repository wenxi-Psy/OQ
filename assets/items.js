/* OQ-45.2 中文版（秦佑凤、胡姝婧 2008 译本）条目数据
 *
 * dim      维度：SD 症状困扰 / IR 人际关系 / SR 社会角色
 * reverse  反向计分（0↔4, 1↔3, 2 不变）
 * critical 关键题，答"有时"及以上需在会谈中跟进（第 8 题只要不为 0 即跟进）
 * na       提供「不适用」选项，一律按 0 分困扰记。
 *          纸质题本是逐题印「如不适用请填 X」的，而 X 随计分方向不同：
 *          正向题填"不是"（原始 0），反向题填"总是这样"（原始 4，反转后为 0）。
 *          让来访者自己判断计分方向是不合理的，所以这里统一成一个「不适用」按钮，
 *          由 score.js 按方向换算，作答者不需要知道哪些题是反向题。
 * naLabel  「不适用」按钮上的文字，逐题写具体，避免被当成"跳过"用
 */
/* 版本号：条目内容（题干、维度归属、反向标记、关键题、「不适用」规则）
 * 每次改动条目数据都要 +1，导出文件里带上它，日后回看才知道那份数据是按哪版条目采的。 */
const OQ_ITEMS_VERSION = '1.0.0';

const OQ_INSTRUMENT = {
  name: 'OQ-45.2',
  translation: '秦佑凤、胡姝婧 (2008) 中文版',
  language: 'zh-CN',
  item_count: 45,
};

const OQ_ITEMS = [
  { id: 1,  text: '我与他人相处融洽', dim: 'IR', reverse: true },
  { id: 2,  text: '我容易疲劳', dim: 'SD' },
  { id: 3,  text: '我对事物没有兴趣', dim: 'SD' },
  { id: 4,  text: '我在学习/工作上感到有压力', dim: 'SR' },
  { id: 5,  text: '我为一些事情而自责', dim: 'SD' },
  { id: 6,  text: '我感到烦躁', dim: 'SD' },
  { id: 7,  text: '我在恋爱/婚姻等重要关系中感到不快乐', dim: 'IR',
    na: true, naLabel: '不适用：目前没有这类关系' },
  { id: 8,  text: '我有结束自己生命的想法', dim: 'SD', critical: true },
  { id: 9,  text: '我感到虚弱', dim: 'SD' },
  { id: 10, text: '我感到害怕', dim: 'SD' },
  { id: 11, text: '醉酒之后，第二天早晨我要再喝一点才能恢复', dim: 'SD', critical: true,
    na: true, naLabel: '不适用：我不喝酒' },
  { id: 12, text: '我对我的学习/工作感到满意', dim: 'SR', reverse: true },
  { id: 13, text: '我感到快乐', dim: 'SD', reverse: true },
  { id: 14, text: '我在学习/工作中付出太多', dim: 'SR' },
  { id: 15, text: '我觉得自己没有价值', dim: 'SD' },
  { id: 16, text: '我为我的家庭问题感到担心', dim: 'IR' },
  { id: 17, text: '我的性生活不够好', dim: 'IR',
    na: true, naLabel: '不适用：目前没有性生活' },
  { id: 18, text: '我感到孤独', dim: 'IR' },
  { id: 19, text: '我经常与人争论', dim: 'IR' },
  { id: 20, text: '我感到被爱和被需要', dim: 'IR', reverse: true },
  { id: 21, text: '我很享受我的空闲时光', dim: 'SR', reverse: true },
  { id: 22, text: '我难以集中注意力', dim: 'SD' },
  { id: 23, text: '我对将来感到无望', dim: 'SD' },
  { id: 24, text: '我喜欢自己', dim: 'SD', reverse: true },
  { id: 25, text: '头脑里有一些干扰我的想法，我无法摆脱', dim: 'SD' },
  { id: 26, text: '我讨厌那些批评我喝酒（或嗑药）的人', dim: 'IR', critical: true,
    na: true, naLabel: '不适用：我不喝酒、也不用药' },
  { id: 27, text: '我的胃口不好', dim: 'SD' },
  { id: 28, text: '我现在的学习/工作状况不如以前好', dim: 'SR' },
  { id: 29, text: '我的心跳剧烈', dim: 'SD' },
  { id: 30, text: '我和朋友熟人的相处有问题', dim: 'IR' },
  { id: 31, text: '我对生活感到满意', dim: 'SD', reverse: true },
  { id: 32, text: '喝酒或嗑药导致我的学习/工作出现问题', dim: 'SR', critical: true,
    na: true, naLabel: '不适用：我不喝酒、也不用药' },
  { id: 33, text: '我感到有些不好的事情即将发生', dim: 'SD' },
  { id: 34, text: '我感到肌肉疼痛', dim: 'SD' },
  { id: 35, text: '我在露天场所、开车或乘坐公汽、火车等时感到害怕', dim: 'SD' },
  { id: 36, text: '我感到紧张', dim: 'SD' },
  { id: 37, text: '我觉得我的爱情关系充实而美好', dim: 'IR', reverse: true,
    na: true, naLabel: '不适用：目前没有恋爱关系' },
  { id: 38, text: '我觉得我在学习/工作上做得不好', dim: 'SR' },
  { id: 39, text: '我在学习/工作上和别人的意见有太多不同', dim: 'SR' },
  { id: 40, text: '我觉得我的脑子出了问题', dim: 'SD' },
  { id: 41, text: '我难以入睡或沉睡', dim: 'SD' },
  { id: 42, text: '我的情绪低落', dim: 'SD' },
  { id: 43, text: '我对我与别人的关系感到满意', dim: 'IR', reverse: true },
  { id: 44, text: '在学习/工作中我感到很生气，以至于做出一些可能会后悔的事', dim: 'SR', critical: true },
  { id: 45, text: '我感到头痛', dim: 'SD' },
];

/* 五点计分标签，索引即分值 */
const OQ_OPTIONS = ['不是', '很少', '有时', '经常', '几乎总是'];

/* 关键题的跟进方向（结果页展示给来访者的版本，措辞不做临床判断） */
const OQ_CRITICAL_NOTES = {
  8:  '与安全有关，请务必让咨询师知道。',
  11: '关于饮酒习惯。',
  26: '关于别人对你饮酒或用药的看法。',
  32: '关于物质使用对学习/工作的影响。',
  44: '关于情绪冲动。',
};
