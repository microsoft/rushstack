interface IGitRepoInfo {
  /** the current branch  */
  branch: string;
  /** sha of the current commit */
  sha: string;
  /** The first 10 chars of the current sha */
  abbreviatedSha: string;
  /** The tag for the current sha (or null) */
  tag: string;
  /** The committer of the current sha */
  committer: string;
  /** The commit date of the current sha */
  committerDate: string;
  /** The author for the current sha */
  author: string;
  /** The authored date for the current sha */
  authorDate: string;
  /** The commit message for the current sha */
  commitMessage: string;
  root: string;
}

declare module "git-repo-info" {
  function gitInfo(): IGitRepoInfo;

  export = gitInfo;
}
