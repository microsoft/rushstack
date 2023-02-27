/**
 * Indicates the tree-like data structure that {@link TreePattern} will traverse.
 *
 * @remarks
 * Since `TreePattern` makes relatively few assumptions object the object structure, this is
 * just an alias for `any`.  At least as far as the portions to be matched, the tree nodes
 * are expected to be JSON-like structures made from JavaScript arrays, JavaScript objects,
 * and primitive values that can be compared using `===`.
 *
 * @public
 */
export declare type TreeNode = any;
/**
 * Provides additional detail about the success or failure of {@link TreePattern.match}.
 *
 * @remarks
 * On success, the object will contain keys for any successfully matched tags, as
 * defined using {@link TreePattern.tag}.
 *
 * On failure, the `failPath` member will indicate the JSON path of the node that
 * failed to match.
 *
 * @public
 */
export declare type ITreePatternCaptureSet = {
    [tagName: string]: TreeNode;
} | {
    failPath: string;
};
/**
 * A fast, lightweight pattern matcher for tree structures such as an Abstract Syntax Tree (AST).
 * @public
 */
export declare class TreePattern {
    private readonly _pattern;
    constructor(pattern: TreeNode);
    /**
     * Labels a subtree within the search pattern, so that the matching object can be retrieved.
     *
     * @remarks
     * Used to build the `pattern` tree for {@link TreePattern.match}.  For the given `subtree` of the pattern,
     * if it is matched, that node will be assigned to the `captures` object using `tagName` as the key.
     *
     * Example:
     *
     * ```ts
     * const myCaptures: { personName?: string } = {};
     * const myPattern = {
     *   name: TreePattern.tag('personName')
     * };
     * if (myPattern.match({ name: 'Bob' }, myCaptures)) {
     *   console.log(myCaptures.personName);
     * }
     * ```
     */
    static tag(tagName: string, subtree?: TreeNode): TreeNode;
    /**
     * Used to specify alternative possible subtrees in the search pattern.
     *
     * @remarks
     * Used to build the `pattern` tree for {@link TreePattern.match}.  Allows several alternative patterns
     * to be matched for a given subtree.
     *
     * Example:
     *
     * ```ts
     * const myPattern: TreePattern = new TreePattern({
     *   animal: TreePattern.oneOf([
     *     { kind: 'dog', bark: 'loud' },
     *     { kind: 'cat', meow: 'quiet' }
     *   ])
     * });
     * if (myPattern.match({ animal: { kind: 'dog', bark: 'loud' } })) {
     *   console.log('I can match dog.');
     * }
     * if (myPattern.match({ animal: { kind: 'cat', meow: 'quiet' } })) {
     *   console.log('I can match cat, too.');
     * }
     * ```
     */
    static oneOf(possibleSubtrees: TreeNode[]): TreeNode;
    /**
     * Match an input tree.
     *
     * @remarks
     * Return true if the `root` node matches the pattern.  (If the `root` node does not match, the child nodes are
     * not recursively tested, since for an Abstract Syntax Tree the caller is typically an efficient visitor
     * callback that already handles that job.)
     *
     * If the input matches the pattern, any tagged subtrees will be assigned to the `captures` target object
     * if provided.  If the input does not match, the path of the mismatched node will be assigned to
     * `captures.failPath`.
     *
     * @param root - the input tree to be matched
     * @param captures - an optional object to receive any subtrees that were matched using {@link TreePattern.tag}
     * @returns `true` if `root` matches the pattern, or `false` otherwise
     */
    match(root: TreeNode, captures?: ITreePatternCaptureSet): boolean;
    private static _matchTreeRecursive;
}
//# sourceMappingURL=TreePattern.d.ts.map