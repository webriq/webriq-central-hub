// GitHub API client — implemented in Sprint 5 (M6)
// Used to create feature branch PRs for code-type tasks

export async function createFeatureBranch(_repo: string, _branchName: string): Promise<void> {
  throw new Error("GitHub client not yet implemented — Sprint 5");
}

export async function createPullRequest(_repo: string, _title: string, _branch: string): Promise<string> {
  throw new Error("GitHub PR creation not yet implemented — Sprint 5");
}
