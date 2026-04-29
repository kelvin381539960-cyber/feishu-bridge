/* ============================================
   Learning Data - Characters, Math, Stories
   ============================================ */

const LITERACY_DATA = {
  levels: [
    {
      id: 1, name: '第一课',
      chars: [
        {
          char: '人', pinyin: 'rén', meaning: '人类，人们',
          strokes: 2, strokeOrder: '撇、捺',
          words: ['人们', '大人', '人生', '好人'],
          quiz: { question: '哪个是"人"？', options: ['人', '大', '天', '入'], answer: 0 }
        },
        {
          char: '大', pinyin: 'dà', meaning: '大的，巨大的',
          strokes: 3, strokeOrder: '横、撇、捺',
          words: ['大家', '大小', '长大', '大学'],
          quiz: { question: '哪个读 dà？', options: ['天', '大', '太', '犬'], answer: 1 }
        },
        {
          char: '小', pinyin: 'xiǎo', meaning: '小的，年幼的',
          strokes: 3, strokeOrder: '竖钩、撇、点',
          words: ['小朋友', '大小', '小学', '小心'],
          quiz: { question: '"小朋友"的"小"是哪个？', options: ['少', '水', '小', '尖'], answer: 2 }
        },
        {
          char: '上', pinyin: 'shàng', meaning: '上面，上方',
          strokes: 3, strokeOrder: '竖、横、横',
          words: ['上面', '上学', '上午', '早上'],
          quiz: { question: '和"下"相反的是？', options: ['上', '左', '右', '中'], answer: 0 }
        },
      ]
    },
    {
      id: 2, name: '第二课',
      chars: [
        {
          char: '日', pinyin: 'rì', meaning: '太阳，日子',
          strokes: 4, strokeOrder: '竖、横折、横、横',
          words: ['日子', '日出', '生日', '日记'],
          quiz: { question: '太阳也叫？', options: ['月', '日', '星', '光'], answer: 1 }
        },
        {
          char: '月', pinyin: 'yuè', meaning: '月亮，月份',
          strokes: 4, strokeOrder: '撇、横折钩、横、横',
          words: ['月亮', '月份', '明月', '月饼'],
          quiz: { question: '中秋节看什么？', options: ['日', '星', '月', '云'], answer: 2 }
        },
        {
          char: '水', pinyin: 'shuǐ', meaning: '水，液体',
          strokes: 4, strokeOrder: '竖钩、横撇、撇、捺',
          words: ['喝水', '水果', '河水', '水杯'],
          quiz: { question: '口渴了要喝？', options: ['火', '水', '土', '木'], answer: 1 }
        },
        {
          char: '火', pinyin: 'huǒ', meaning: '火焰，火',
          strokes: 4, strokeOrder: '点、撇、撇、捺',
          words: ['火车', '大火', '火山', '灭火'],
          quiz: { question: '哪个是"火"？', options: ['水', '木', '土', '火'], answer: 3 }
        },
      ]
    },
    {
      id: 3, name: '第三课',
      chars: [
        {
          char: '山', pinyin: 'shān', meaning: '山，高山',
          strokes: 3, strokeOrder: '竖、竖折、竖',
          words: ['大山', '山上', '山水', '火山'],
          quiz: { question: '高高的是？', options: ['水', '山', '田', '石'], answer: 1 }
        },
        {
          char: '石', pinyin: 'shí', meaning: '石头，岩石',
          strokes: 5, strokeOrder: '横、撇、竖、横折、横',
          words: ['石头', '石子', '宝石', '岩石'],
          quiz: { question: '硬硬的是？', options: ['水', '云', '石', '风'], answer: 2 }
        },
        {
          char: '田', pinyin: 'tián', meaning: '田地，农田',
          strokes: 5, strokeOrder: '竖、横折、横、竖、横',
          words: ['田地', '水田', '田野', '稻田'],
          quiz: { question: '种庄稼的地方叫？', options: ['山', '田', '河', '路'], answer: 1 }
        },
        {
          char: '木', pinyin: 'mù', meaning: '木头，树木',
          strokes: 4, strokeOrder: '横、竖、撇、捺',
          words: ['木头', '树木', '木屋', '木马'],
          quiz: { question: '树是用什么做的？', options: ['金', '木', '水', '火'], answer: 1 }
        },
      ]
    },
    {
      id: 4, name: '第四课',
      chars: [
        {
          char: '口', pinyin: 'kǒu', meaning: '嘴巴，出入口',
          strokes: 3, strokeOrder: '竖、横折、横',
          words: ['开口', '门口', '口水', '人口'],
          quiz: { question: '吃东西用什么？', options: ['手', '口', '耳', '目'], answer: 1 }
        },
        {
          char: '耳', pinyin: 'ěr', meaning: '耳朵',
          strokes: 6, strokeOrder: '横、竖、竖、横、横、横',
          words: ['耳朵', '耳机', '木耳', '耳环'],
          quiz: { question: '听声音用什么？', options: ['口', '目', '耳', '手'], answer: 2 }
        },
        {
          char: '目', pinyin: 'mù', meaning: '眼睛',
          strokes: 5, strokeOrder: '竖、横折、横、横、横',
          words: ['目光', '目标', '耳目', '题目'],
          quiz: { question: '"目"是身体哪个部位？', options: ['嘴巴', '耳朵', '眼睛', '鼻子'], answer: 2 }
        },
        {
          char: '手', pinyin: 'shǒu', meaning: '手，双手',
          strokes: 4, strokeOrder: '撇、横、横、竖钩',
          words: ['小手', '手机', '左手', '拍手'],
          quiz: { question: '拿东西用什么？', options: ['手', '口', '目', '足'], answer: 0 }
        },
      ]
    },
  ]
};

const MATH_CATEGORIES = [
  { id: 'count', icon: '🔢', title: '数一数', desc: '认识数字 1-20' },
  { id: 'add', icon: '➕', title: '加法', desc: '10以内加法' },
  { id: 'sub', icon: '➖', title: '减法', desc: '10以内减法' },
  { id: 'compare', icon: '⚖️', title: '比大小', desc: '谁大谁小' },
];

const EMOJI_ITEMS = ['🍎', '🍊', '🍋', '🍇', '🍓', '🌟', '🐱', '🐶', '🐰', '🦋', '🌸', '🎈'];

const STORY_DATA = [
  {
    id: 'tortoise-hare',
    title: '龟兔赛跑',
    desc: '谁会赢得比赛呢？',
    icon: '🐢',
    bgColor: '#E8F5E9',
    pages: [
      {
        illustration: '🐰🐢',
        bgColor: '#E8F5E9',
        text: '从前，森林里住着一只<span class="highlight">兔子</span>和一只<span class="highlight">乌龟</span>。兔子跑得很快，乌龟走得很慢。'
      },
      {
        illustration: '🐰💨',
        bgColor: '#FFF3E0',
        text: '有一天，兔子对乌龟说："你走得那么慢，我们来<span class="highlight">比赛</span>跑步吧！"乌龟点了点头。'
      },
      {
        illustration: '🏃‍♂️🌳',
        bgColor: '#E3F2FD',
        text: '比赛开始了！兔子一下子就跑出去好远好远。它回头一看，<span class="highlight">乌龟</span>还在远远的后面呢。'
      },
      {
        illustration: '🐰💤🌳',
        bgColor: '#FCE4EC',
        text: '兔子想："乌龟那么慢，我先<span class="highlight">睡一觉</span>吧。"说着，兔子就在大树下睡着了。'
      },
      {
        illustration: '🐢💪',
        bgColor: '#F3E5F5',
        text: '乌龟没有停下来，它一步一步地走着、走着，<span class="highlight">坚持</span>不放弃，慢慢地超过了兔子。'
      },
      {
        illustration: '🐢🏆',
        bgColor: '#FFF9C4',
        text: '最后，乌龟第一个到达了终点！兔子醒来的时候，比赛已经结束了。这个故事告诉我们：<span class="highlight">坚持就是胜利</span>！'
      },
    ],
    quiz: {
      question: '谁赢得了比赛？',
      options: ['兔子', '乌龟', '两个都赢了', '两个都没赢'],
      answer: 1
    }
  },
  {
    id: 'three-bears',
    title: '三只小熊',
    desc: '大中小，刚刚好',
    icon: '🐻',
    bgColor: '#FFF3E0',
    pages: [
      {
        illustration: '🐻🐻🐻',
        bgColor: '#FFF3E0',
        text: '森林里住着<span class="highlight">三只小熊</span>：熊爸爸、熊妈妈和小熊宝宝。它们住在一个温暖的小木屋里。'
      },
      {
        illustration: '🥣🥣🥣',
        bgColor: '#FFECB3',
        text: '一天早上，熊妈妈煮了三碗粥。<span class="highlight">大碗</span>是爸爸的，<span class="highlight">中碗</span>是妈妈的，<span class="highlight">小碗</span>是宝宝的。'
      },
      {
        illustration: '👧🏠',
        bgColor: '#E8F5E9',
        text: '小熊一家出去散步了。这时候，一个叫<span class="highlight">金发姑娘</span>的小女孩走进了它们的家。'
      },
      {
        illustration: '👧🥣',
        bgColor: '#E3F2FD',
        text: '金发姑娘尝了大碗的粥——太烫了！中碗的粥——太凉了！<span class="highlight">小碗的粥——刚刚好！</span>她全部喝光了。'
      },
      {
        illustration: '🐻😮',
        bgColor: '#FCE4EC',
        text: '三只小熊回来了！熊宝宝大叫："<span class="highlight">谁喝了我的粥？</span>"金发姑娘吓了一跳，赶紧跑走了。'
      },
      {
        illustration: '🐻❤️🏠',
        bgColor: '#F3E5F5',
        text: '从那以后，三只小熊记得出门时要<span class="highlight">锁好门</span>。这个故事告诉我们：不能随便进别人的家哦！'
      },
    ],
    quiz: {
      question: '小熊宝宝的碗是哪个？',
      options: ['大碗', '中碗', '小碗', '没有碗'],
      answer: 2
    }
  },
  {
    id: 'little-red',
    title: '小红帽',
    desc: '去外婆家的路上',
    icon: '🧒',
    bgColor: '#FFEBEE',
    pages: [
      {
        illustration: '🧒🧣',
        bgColor: '#FFEBEE',
        text: '从前有一个可爱的小女孩，她总是戴着一顶<span class="highlight">红色的帽子</span>，大家都叫她"小红帽"。'
      },
      {
        illustration: '🧓🏠',
        bgColor: '#FFF3E0',
        text: '一天，妈妈让小红帽去看望生病的<span class="highlight">外婆</span>，还带上了好吃的蛋糕和水果。'
      },
      {
        illustration: '🌲🐺',
        bgColor: '#E8F5E9',
        text: '小红帽走在森林的小路上。突然，一只<span class="highlight">大灰狼</span>出现了！它假装很友好地问小红帽去哪里。'
      },
      {
        illustration: '🧒🌸',
        bgColor: '#FCE4EC',
        text: '大灰狼说："你看路边的<span class="highlight">花儿</span>多漂亮呀，摘几朵送给外婆吧。"小红帽就去摘花了。'
      },
      {
        illustration: '🪓😊',
        bgColor: '#E3F2FD',
        text: '幸好，一个<span class="highlight">猎人</span>经过外婆家，赶走了大灰狼，救出了外婆。小红帽也赶到了！'
      },
      {
        illustration: '🧒🧓❤️',
        bgColor: '#F3E5F5',
        text: '小红帽紧紧抱住外婆，说："我以后再也不跟<span class="highlight">陌生人</span>说话了！"这个故事告诉我们要注意安全哦！'
      },
    ],
    quiz: {
      question: '小红帽去看望谁？',
      options: ['爸爸', '妈妈', '外婆', '朋友'],
      answer: 2
    }
  },
  {
    id: 'ugly-duckling',
    title: '丑小鸭',
    desc: '每个人都是独特的',
    icon: '🦢',
    bgColor: '#E3F2FD',
    pages: [
      {
        illustration: '🥚🐣',
        bgColor: '#E3F2FD',
        text: '春天来了，鸭妈妈孵出了一群可爱的小鸭子。可是最后一只小鸭子长得跟别人<span class="highlight">不一样</span>。'
      },
      {
        illustration: '🐤😢',
        bgColor: '#FFECB3',
        text: '其他小鸭子嘲笑它说："你长得真丑！"大家都不想跟它玩，<span class="highlight">丑小鸭</span>很伤心。'
      },
      {
        illustration: '🐤🍂',
        bgColor: '#FFF3E0',
        text: '丑小鸭离开了家，独自走过了<span class="highlight">秋天</span>和<span class="highlight">冬天</span>。它很孤独，但从不放弃。'
      },
      {
        illustration: '🌸🐤',
        bgColor: '#F3E5F5',
        text: '终于，<span class="highlight">春天</span>又来了。丑小鸭来到湖边，低头一看水中的倒影...'
      },
      {
        illustration: '🦢✨',
        bgColor: '#E8F5E9',
        text: '啊！它变成了一只美丽的<span class="highlight">白天鹅</span>！洁白的羽毛，优雅的脖子，比所有鸭子都漂亮！'
      },
      {
        illustration: '🦢❤️🌈',
        bgColor: '#FCE4EC',
        text: '大家都赞美它的美丽。这个故事告诉我们：<span class="highlight">每个人都是独特的</span>，不要因为不同而难过，终有一天会发光！'
      },
    ],
    quiz: {
      question: '丑小鸭最后变成了什么？',
      options: ['大鸭子', '白天鹅', '小鸡', '大公鸡'],
      answer: 1
    }
  }
];
