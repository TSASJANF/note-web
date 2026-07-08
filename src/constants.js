/** Note ID 允许的字符：字母、数字、下划线、连字符 */
const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/** 生成唯一 ID 的最大尝试次数 */
const MAX_ID_ATTEMPTS = 100;

/** 随机 ID 初始长度（3位 = 64^3 = 262,144 种组合） */
const MIN_RANDOM_ID_LENGTH = 3;

/** 随机 ID 最大长度（12位 = 64^12 ≈ 4.7×10²¹ 种组合） */
const MAX_RANDOM_ID_LENGTH = 12;

/** 随机 ID 字符集（64个 URL-safe 字符） */
const RANDOM_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-';

/** 笔记 ID 最大长度限制 */
const MAX_ID_LENGTH = 64;

module.exports = {
    ID_REGEX,
    MAX_ID_ATTEMPTS,
    MIN_RANDOM_ID_LENGTH,
    MAX_RANDOM_ID_LENGTH,
    RANDOM_ID_ALPHABET,
    MAX_ID_LENGTH
};
