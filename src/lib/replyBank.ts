import type { AbilityTag, InterviewAction } from "./types";

/**
 * 候选人高频反应 → 面试官固定口语回复库（约 100 条）。
 * 命中后原样下发，不经 LLM 润色。
 *
 * #31 用户未提供 → 使用紧张/重组兜底句。
 * #32–52 用户编号与候选人语义有错位，已按语义对齐。
 */

export type ReplyBankFlags = {
  /** 诚信/挂名等红线：直接结束本场 */
  endInterview?: boolean;
  /** 仅第一次给轻提示；已提示过则本条不命中 */
  hintOnce?: boolean;
  /** 收束本题并软换下一题 */
  softSkip?: boolean;
};

export type ReplyBankEntry = {
  id: number;
  patterns: RegExp[];
  reply: string;
  flags?: ReplyBankFlags;
  tags?: AbilityTag[];
  action?: InterviewAction;
};

export type ReplyBankMatch = {
  id: number;
  reply: string;
  flags: ReplyBankFlags;
  tags?: AbilityTag[];
  action?: InterviewAction;
};

/**
 * 匹配顺序：更具体 / 红线优先于泛化「不会」等。
 * 阶段说明落在 flags，不进 reply 正文。
 */
export const REPLY_BANK: ReplyBankEntry[] = [
  // —— 诚信红线 → endInterview ——
  {
    id: 5,
    patterns: [/简历是乱写的/, /简历.*乱写/, /简历.*瞎写/],
    reply: "好的，那你先把简历改扎实了再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },
  {
    id: 6,
    patterns: [/项目经历有一部分是编的/, /项目.*是编的/, /经历.*是编的/, /有一部分是编的/],
    reply: "好的，那你先把项目经历写扎实了再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },
  {
    id: 7,
    patterns: [/这个项目其实不是我做的/, /项目其实不是我做的/, /其实不是我做的/],
    reply: "好的，那你先把真实负责的项目整理清楚再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },
  {
    id: 8,
    patterns: [/只是挂名/, /我只是挂名/, /主要是别人做的.*挂名/, /挂名/],
    reply: "好的，那你先把个人贡献写清楚再来面试，今天就先到这里。",
    flags: { endInterview: true },
    tags: ["role_mismatch_suspected"],
    action: "FINISH",
  },

  // —— 要提示 / 要答案 / 想跳题（先于泛化「不会」）——
  {
    id: 27,
    patterns: [/你能给我一点提示吗/, /给我一点提示/, /给点提示/, /能提示一下/],
    reply: "你可以思考思考。",
    flags: { hintOnce: true },
    tags: ["weak_independent_problem_solving"],
    action: "REFRAME",
  },
  {
    id: 28,
    patterns: [/标准答案是什么/, /标准答案/, /正确答案是什么/],
    reply: "没有标准答案，我要你的思考过程。",
    tags: ["weak_independent_problem_solving"],
    action: "FORMULA_DEFLECT",
  },
  {
    id: 29,
    patterns: [/这题能跳过吗/, /能跳过吗/, /可以跳过吗/],
    reply: "没有标准答案，你谈谈你的思考过程也行。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 30,
    patterns: [/下一题吧.*真不会/, /这题我真不会/, /下一题吧/],
    reply: "没有标准答案，你谈谈你的思考过程也行。",
    action: "FORMULA_DEFLECT",
  },

  // —— 卡壳 / 不会（追问规划，不换题）——
  {
    id: 1,
    patterns: [/我想一下/, /嗯+[…\.．。]*我想一下/, /让我想一下/, /我想想/],
    reply: "嗯，你想一下可以，也可以说说你第一反应是什么。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 2,
    patterns: [/这个我不太清楚/, /我不太清楚/, /不太清楚/],
    reply: "不太清楚没关系，说说你推测会怎么查。",
    tags: ["can_reason_trainable"],
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 4,
    patterns: [/我没学过这块/, /没学过这块/, /这块没学过/, /没学过/],
    reply: "没学过这块，那你学过的最接近的是什么？",
    tags: ["knowledge_gap_not_learned"],
    action: "REFRAME",
  },
  {
    id: 3,
    patterns: [/^我不会[。.!！]?$/, /我不会[。.!！]?$/, /我不会做/],
    reply: "不会可以，那你要告诉我你的规划呢。",
    tags: ["can_reason_trainable"],
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 紧张 / 重组 / 澄清（含 #31 兜底）——
  {
    id: 31,
    patterns: [/我有点紧张/, /有点紧张.*讲乱/, /讲乱了/, /太紧张/],
    reply: "紧张正常，深呼吸，重新讲。",
    tags: ["nervous_but_capable"],
    action: "REFRAME",
  },
  {
    id: 32,
    patterns: [/我重新组织一下语言/, /重新组织一下语言/, /重新组织语言/],
    reply: "你重新组织语言，我给你30秒。",
    tags: ["nervous_but_capable"],
    action: "REFRAME",
  },
  {
    id: 33,
    patterns: [/你能把问题再说一遍吗/, /把问题再说一遍/, /再说一遍问题/, /问题再说一遍/],
    reply: "我再说一遍问题，你抓关键词。",
    action: "REFRAME",
  },
  {
    id: 34,
    patterns: [/性能优化还是稳定性/, /你问的是性能优化还是/, /优化还是稳定/],
    reply: "我问的是性能优化，不是稳定性。",
    action: "FORMULA_DEFLECT",
  },

  // —— 项目表述虚 / 团队 ——
  {
    id: 9,
    patterns: [/我当时负责接口开发/, /负责接口开发/],
    reply: "你负责接口开发，具体接口几个、QPS多少？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 10,
    patterns: [/我用的是\s*React\s*和\s*Node/i, /React\s*和\s*Node/i],
    reply: "React 和 Node 都用过，状态管理怎么做的？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 11,
    patterns: [/大概就是做了一个系统/, /做了一个系统吧/, /做了一个系统/],
    reply: "做了一个系统太虚了，系统解决什么问题？你在其中有什么贡献？",
    tags: ["surface_knowledge_no_practice"],
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 12,
    patterns: [/就是优化了一下/, /优化了一下/, /然后那个.+优化/],
    reply: "优化了一下，优化前指标是什么？优化的效果如何？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 13,
    patterns: [/反正就那样/, /效果还行/],
    reply: "可以说说具体效果？行到什么程度？有数据吗？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 14,
    patterns: [/我们团队一起做的/, /团队一起做的/],
    reply: "团队一起做的，那你个人独立负责哪块？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 15,
    patterns: [/我们把性能优化了很多/, /性能优化了很多/],
    reply: "性能优化了很多，很多是多少？",
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 有数据 / 深挖 ——
  {
    id: 16,
    patterns: [/P95\s*从\s*800\s*ms\s*优化到\s*200\s*ms/i, /接口\s*P95.+800.+200/i],
    reply: "嗯",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 17,
    patterns: [/我负责排查线上慢查询/, /排查线上慢查询/, /排查慢查询/],
    reply: "你负责排查慢查询，慢在哪条 SQL？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 18,
    patterns: [/具体指标我忘了/, /指标我忘了/],
    reply: "具体指标忘了，那你怎么证明优化有效？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 19,
    patterns: [/结果怎么验证的我不太记得/, /怎么验证的我不太记得/, /验证.+不太记得/],
    reply: "那你说说落地效果呢？",
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 选型 / 失败 / 边界 ——
  {
    id: 20,
    patterns: [/选型是因为大家都在用/, /因为大家都在用/, /大家都在用/],
    reply: "那你自己是怎么感觉呢？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 21,
    patterns: [/选\s*PostgreSQL.+复杂查询/i, /我选\s*PostgreSQL/i, /选 PostgreSQL 是因为/i],
    reply: "选 PostgreSQL 的理由可以，但对比过什么？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 22,
    patterns: [/失败过一次方案/, /后来回滚了/],
    reply: "失败过一次方案，为什么失败？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 23,
    patterns: [/没失败过.*一直很顺利/, /没失败过/, /一直很顺利/],
    reply: "那你觉得会遇到什么问题？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 24,
    patterns: [/边界情况我没怎么想/, /边界.?没怎么想/, /边界情况.*没/],
    reply: "边界情况没怎么想，现在想两个。",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 25,
    patterns: [/高并发下可能会有锁竞争/, /可能会有锁竞争/, /锁竞争/],
    reply: "高并发锁竞争，具体什么锁？",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 26,
    patterns: [/我可以画一下架构/, /画一下架构/, /画个架构/],
    reply: "我们主要先口头交流吧。",
    action: "FORMULA_DEFLECT",
  },

  // —— 元问题 / 录用相关 ——
  {
    id: 35,
    patterns: [/薪资大概多少/, /工资多少/, /薪资.*多少/],
    reply: "薪资后面HR会聊，先证明能力。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 36,
    patterns: [/你们加班多吗/, /加班多吗/, /会加班吗/],
    reply: "加班看业务节奏，你先回答技术问题。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 37,
    patterns: [/我能过吗/, /能不能过/, /我能通过吗/],
    reply: "能不能过，面完综合判断。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 38,
    patterns: [/你觉得我面得怎么样/, /我面得怎么样/, /面得如何/],
    reply: "我觉得你面得怎么样，你自己先复盘。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 39,
    patterns: [/转正机会大吗/, /转正机会/, /能转正吗/],
    reply: "转正机会有，但先看实习产出。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 40,
    patterns: [/这个问题和我简历哪一段相关/, /和我简历哪一段相关/, /简历哪一段/],
    reply: "这题和你简历这段相关，你自己没对上？",
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 经历深浅 ——
  {
    id: 41,
    patterns: [/我实习时做过类似的/, /实习时做过类似/, /做过类似的/],
    reply: "实习做过类似的，那类似在哪？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 42,
    patterns: [/学校课程里讲过.*没实操/, /课程里讲过.*没实操/, /讲过.*没实操/],
    reply: "课程讲过没实操，那你做过最小验证吗？",
    tags: ["surface_knowledge_no_practice"],
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 43,
    patterns: [/我看过文档.*没落地/, /看过文档.*没落地/, /只看过文档/],
    reply: "看过文档没落地，等于不会。",
    tags: ["surface_knowledge_no_practice"],
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 44,
    patterns: [/我只做过\s*demo/i, /只做过\s*demo.*生产/i, /没有上过生产/, /没上过生产/],
    reply: "只做过 demo 没上生产，那你知道差在哪吗？",
    tags: ["surface_knowledge_no_practice"],
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 45,
    patterns: [/事故.*是我引入的/, /是我引入的/, /我引入的事故/],
    reply: "事故是你引入的，讲清楚根因和修复。",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 46,
    patterns: [/事故不是我导致的/, /不是我导致.*排查/, /参与排查/],
    reply: "不是你导致但参与排查，你具体查了什么？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 47,
    patterns: [/我用日志和指标定位到瓶颈/, /日志和指标定位/, /定位到瓶颈/],
    reply: "日志和指标定位瓶颈，哪个指标？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 48,
    patterns: [/命中率大概\s*85%?/, /加了缓存.*85/, /缓存.*命中率.*85/],
    reply: "缓存命中率85%，怎么统计的？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 49,
    patterns: [/缓存穿透怎么处理我不太熟/, /缓存穿透.*不熟/, /穿透.*不太熟/],
    reply: "缓存穿透不熟，那缓存雪崩呢？",
    tags: ["knowledge_gap_not_learned"],
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 50,
    patterns: [/用布隆过滤器/, /布隆过滤器/, /空值缓存/],
    reply: "布隆过滤器或空值缓存，说下代价。",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 51,
    patterns: [/数据库怎么分库分表/, /怎么分库分表/, /如何分库分表/],
    reply: "分库分表只知道概念，那什么时候不该分？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 52,
    patterns: [/这个我只知道概念/, /我只知道概念/, /只知道概念/],
    reply: "分库分表只知道概念，那什么时候不该分？",
    tags: ["surface_knowledge_no_practice"],
    action: "FOLLOW_UP_TRADEOFF",
  },

  // —— 数据库 / 前端 / 工程 ——
  {
    id: 53,
    patterns: [/事务隔离级别我背过/, /隔离级别我背过/, /隔离级别.*说不清/],
    reply: "隔离级别背过，可重复读解决什么问题？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 54,
    patterns: [/我实际用过可重复读/, /实际用过可重复读/, /用过可重复读/],
    reply: "实际用过可重复读，遇到幻读了吗？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 55,
    patterns: [/死锁遇到过.*加锁顺序/, /统一加锁顺序/, /死锁遇到过/],
    reply: "死锁加统一加锁顺序，还有别的办法吗？",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 56,
    patterns: [/前端我也做.*列表和表单/, /主要是列表和表单/, /列表和表单/],
    reply: "前端做列表表单，虚拟列表了解吗？",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 57,
    patterns: [/CSS\s*细节我不熟/i, /CSS.*不熟/i],
    reply: "CSS 不熟可以，那布局怎么保证？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 58,
    patterns: [/TypeScript\s*类型我用得比较多/i, /TypeScript.*用得比较多/i, /TS\s*类型用得/i],
    reply: "TypeScript 用得多，泛型约束怎么写？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 59,
    patterns: [/\bany\b.*赶工期/i, /any\s*我也用过/i, /用过\s*any/i],
    reply: "any 赶工期可以，但你怎么控制风险？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 60,
    patterns: [/代码评审里我主要看边界/, /评审.*边界和错误处理/, /代码评审.*错误处理/],
    reply: "代码评审看边界和错误处理，举例。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 61,
    patterns: [/测试我写得少/, /很少写测试/, /测试写得不多/],
    reply: "测试写得少，那你怎么保证质量？",
    action: "FOLLOW_UP_PITFALL",
  },
  {
    id: 62,
    patterns: [/覆盖率大概\s*60%?/, /单测.*60%?/, /有单测.*60/],
    reply: "单测60%，哪些没覆盖？为什么？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 63,
    patterns: [/没有自动化测试/, /都是手动测/, /全靠手动测/],
    reply: "没有自动化测试，回归怎么做？",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 64,
    patterns: [/上线流程是提\s*PR/i, /提\s*PR.*灰度/i, /然后灰度/],
    reply: "提 PR 灰度，灰度策略是什么？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 65,
    patterns: [/回滚方案是保留上一个镜像/, /保留上一个镜像/, /回滚.*镜像/],
    reply: "回滚保留镜像，数据库变更怎么回滚？",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 66,
    patterns: [/如果让我重做.*监控/, /会先补监控/, /重做.*补监控/],
    reply: "重做会先补监控，监控哪些指标？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 67,
    patterns: [/最大的收获是学会排查/, /最大收获.*排查/, /收获是学会排查/],
    reply: "最大收获是排查，讲一次完整排查。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 68,
    patterns: [/最大的不足是基础不扎实/, /基础不扎实/, /不足.*不扎实/],
    reply: "最大不足是基础不扎实，那就补基础。",
    tags: ["self_awareness_gap"],
    action: "FORMULA_DEFLECT",
  },
  {
    id: 69,
    patterns: [/比较擅长业务实现/, /擅长业务实现.*原理一般/, /原理一般/],
    reply: "擅长业务实现原理一般，那原理现在问。",
    action: "FOLLOW_UP_TRADEOFF",
  },
  {
    id: 70,
    patterns: [/我更想做后端/, /更想做后端/, /偏向后端/],
    reply: "更想做后端，那你后端深度在哪？",
    action: "FOLLOW_UP_OWNERSHIP",
  },

  // —— 算法 / 表达控场 ——
  {
    id: 71,
    patterns: [/我对算法不太自信/, /算法不太自信/, /算法.*不自信/],
    reply: "算法不自信，那先写思路不写代码。",
    tags: ["nervous_but_capable"],
    action: "REFRAME",
  },
  {
    id: 72,
    patterns: [/这题我可以写伪代码吗/, /可以写伪代码吗/, /写伪代码/],
    reply: "可以写伪代码，但边界要写清。",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 73,
    patterns: [/时间复杂度我算错了/, /复杂度算错了/, /算错了.*重新想/],
    reply: "时间复杂度算错了，重新算。",
    action: "REFRAME",
  },
  {
    id: 74,
    patterns: [/我卡在这里了/, /卡在这里了/, /卡住了/],
    reply: "你卡住了，我等你10秒。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 75,
    patterns: [/抱歉.*还在想/, /我还在想/, /长时间沉默/],
    reply: "长时间沉默可以，但你要说出卡点。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 76,
    patterns: [/我不知道从哪开始讲/, /不知道从哪开始/, /从哪开始讲/],
    reply: "不知道从哪开始，就先定义问题。",
    action: "REFRAME",
  },
  {
    id: 77,
    patterns: [/我先说结论/, /先说结论.*索引/, /先说结论/],
    reply: "先说结论可以，但结论要有依据。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 78,
    patterns: [/我先讲背景.*再说/, /先讲背景/, /先说背景/],
    reply: "先背景再说你做了什么，控制在一分钟。",
    action: "TIMEBOX",
  },
  {
    id: 79,
    patterns: [/这个问题太大了.*拆成三点/, /拆成三点/, /我拆成三点/],
    reply: "问题太大拆三点，这个习惯不错。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 80,
    patterns: [/我说得比较散/, /要我聚焦哪块/, /说得散/],
    reply: "说得散没关系，你聚焦技术方案。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 81,
    patterns: [/技术方案还是业务价值/, /想听技术方案还是/, /技术还是业务/],
    reply: "我想听技术方案，也听业务价值。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 82,
    patterns: [/我可以换个项目讲吗/, /换个项目讲/, /换个项目.*不熟/, /这个项目不熟/],
    reply: "换项目可以，但别换成更虚的。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 83,
    patterns: [/这个项目太久了/, /细节模糊/, /太久了.*模糊/],
    reply: "项目太久细节模糊，那讲你记得的。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 84,
    patterns: [/我昨天刚看的/, /可能记混了/, /昨天刚看/],
    reply: "昨天刚看可能记混，那别硬编。",
    tags: ["surface_knowledge_no_practice"],
    action: "FORMULA_DEFLECT",
  },
  {
    id: 85,
    patterns: [/其实我准备的是另一套说辞/, /另一套说辞/, /准备了另一套/],
    reply: "准备另一套说辞？我们按真实经历聊。",
    tags: ["surface_knowledge_no_practice"],
    action: "FORMULA_DEFLECT",
  },
  {
    id: 86,
    patterns: [/我实话实说.*不行/, /这块我不行/, /实话实说.*这块/],
    reply: "实话实说不行的，比编造强。",
    tags: ["can_reason_trainable"],
    action: "FORMULA_DEFLECT",
  },
  {
    id: 87,
    patterns: [/我可以回家补完再面吗/, /回家补完再面/, /回去补完/],
    reply: "回家补完再面不现实，现在能补多少？",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 88,
    patterns: [/今天状态不好.*改期/, /能改期吗/, /可不可以改期/, /状态不好/],
    reply: "状态不好改期，可以走流程申请。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 89,
    patterns: [/我觉得这题超纲了/, /这题超纲/, /超纲了/],
    reply: "觉得超纲，那你说说哪一步超纲。",
    action: "FOLLOW_UP_BOUNDARY",
  },
  {
    id: 90,
    patterns: [/校招问这个是不是太深了/, /校招问这个/, /是不是太深了/],
    reply: "校招问这个深不深，看岗位要求。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 91,
    patterns: [/你们团队技术栈是什么/, /团队技术栈是什么/, /你们技术栈/],
    reply: "团队技术栈后面可以介绍，先答题。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 92,
    patterns: [/这个岗更看重业务还是基础/, /更看重业务还是基础/, /业务还是基础/],
    reply: "更看重业务还是基础，两者都要。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 93,
    patterns: [/我还有补充.*限流/, /还做了限流/, /补充.*限流/],
    reply: "还有补充限流，限流算法用的哪种？",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 94,
    patterns: [/刚才那句我说错了/, /更正一下/, /我说错了/],
    reply: "刚才说错了更正，可以，继续。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 95,
    patterns: [/我刚才漏了最关键的一点/, /漏了最关键/, /刚才漏了/],
    reply: "漏了最关键一点，现在补上。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 96,
    patterns: [/你打断我一下也行/, /我有点啰嗦/, /你可以打断/],
    reply: "我打断你可以，那你先给结论。",
    action: "TIMEBOX",
  },
  {
    id: 97,
    patterns: [/嗯嗯嗯/, /然后[…·.]*就是[…·.]*那个/, /就是[…·.]*那个[…·.]*/],
    reply: "口头语太多，面试表达也是能力。",
    action: "FORMULA_DEFLECT",
  },
  {
    id: 98,
    patterns: [/^好的[，,]?明白[。.!！]?$/, /^明白了?[。.!！]?$/, /好的[，,]?明白/],
    reply: "好的明白，那我们收束这题。",
    flags: { softSkip: true },
    action: "SKIP_SOFT",
  },
  {
    id: 99,
    patterns: [/没有了[，,]?就这些/, /没有了.*就这些/, /就这些[。.!！]?$/],
    reply: "没有了就这些，那我来总结追问。",
    action: "FOLLOW_UP_OWNERSHIP",
  },
  {
    id: 100,
    patterns: [/谢谢老师.*结束这题/, /想结束这题/, /这题到这里吧/],
    reply: "谢谢老师想结束这题，可以，但结果综合评估。",
    flags: { softSkip: true },
    action: "SKIP_SOFT",
  },
];

function normalizeAnswer(answer: string): string {
  return answer.trim().replace(/\s+/g, " ");
}

/**
 * 在 decideTurn 早期调用：命中则优先原样回复。
 * 按库顺序取首个强匹配（库内已把具体/红线条目排前）。
 * hintOnce 且本题已提示过 → 视为未命中。
 */
export function matchReplyBank(
  answer: string,
  ctx: { hintCount?: number } = {},
): ReplyBankMatch | null {
  const text = normalizeAnswer(answer);
  if (!text) return null;

  for (const entry of REPLY_BANK) {
    if (entry.flags?.hintOnce && (ctx.hintCount ?? 0) >= 1) continue;
    if (entry.patterns.some((re) => re.test(text))) {
      return {
        id: entry.id,
        reply: entry.reply,
        flags: entry.flags ?? {},
        tags: entry.tags,
        action: entry.action,
      };
    }
  }
  return null;
}

export function bankStyleHint(match: ReplyBankMatch): string {
  const flags = Object.entries(match.flags)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(",");
  return `replyBank#${match.id}${flags ? `(${flags})` : ""}`;
}
