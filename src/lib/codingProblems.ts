import type { CodingProblem } from "./types";

/** 业务面编程环节：可手写、可跑测的小题（非 LeetCode OAuth） */
export const CODING_PROBLEMS: CodingProblem[] = [
  {
    id: "coding_two_sum",
    title: "两数之和（返回下标）",
    prompt:
      "实现函数 twoSum(nums, target)：在数组 nums 中找出和为 target 的两个数的下标，返回长度为 2 的数组。假设恰好有一组解，且同一元素不能用两次。",
    starterCode: `function twoSum(nums, target) {
  // TODO: 返回 [i, j]
  
}`,
    language: "javascript",
    tests: [
      { name: "基础样例", args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { name: "靠后一对", args: [[3, 2, 4], 6], expected: [1, 2] },
      { name: "相同数字", args: [[3, 3], 6], expected: [0, 1] },
    ],
    complexityHint: "期望 O(n) 时间，可用哈希表",
  },
  {
    id: "coding_valid_paren",
    title: "有效括号",
    prompt:
      "实现函数 isValid(s)：判断字符串 s 是否为有效括号序列。只含 ()[]{} ，空串视为有效。",
    starterCode: `function isValid(s) {
  // TODO: 返回 true / false
  
}`,
    language: "javascript",
    tests: [
      { name: "简单合法", args: ["()[]{}"], expected: true },
      { name: "嵌套合法", args: ["{[()]}"], expected: true },
      { name: "错配", args: ["(]"], expected: false },
      { name: "空串", args: [""], expected: true },
    ],
    complexityHint: "期望 O(n) 时间，栈模拟",
  },
];

export function pickCodingProblem(seed = 0): CodingProblem {
  return CODING_PROBLEMS[Math.abs(seed) % CODING_PROBLEMS.length]!;
}

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}
