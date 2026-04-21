export interface PostMeta {
  slug: string;
  filename: string;
  title: string;
  description: string;
  pubDate: string;
  tags: string[];
  updatedDate?: string | null;
}

export interface PostDetail {
  slug: string;
  filename: string;
  frontmatter: {
    title: string;
    description: string;
    pubDate: string;
    tags: string[];
    updatedDate?: string | null;
  };
  content: string;
}

export interface GitStatus {
  branch: string;
  lastCommit: string;
  remoteUrl?: string;
  hasChanges: boolean;
  changedFiles: string[];
}

export interface BlogAppInfo {
  blogRoot: string;
  uploadDir: string;
  remoteUrl: string;
  remoteName: string;
  branch: string;
}

export interface BlogSettings {
  blogRoot: string;
  remoteUrl: string;
  remoteName: string;
  branch: string;
}

export interface BlogApi {
  listPosts: () => Promise<PostMeta[]>;
  getPost: (slug: string) => Promise<PostDetail>;
  createPost: (payload: {
    slug: string;
    frontmatter: PostDetail['frontmatter'];
    content: string;
  }) => Promise<{ success: boolean; slug: string; filename: string }>;
  updatePost: (
    slug: string,
    payload: { frontmatter: PostDetail['frontmatter']; content: string }
  ) => Promise<{ success: boolean; slug: string; filename: string }>;
  deletePost: (slug: string) => Promise<{ success: boolean }>;
  uploadImage: (payload: {
    name: string;
    type: string;
    bytes: number[];
  }) => Promise<{ url: string; filename: string }>;
  getGitStatus: () => Promise<GitStatus>;
  syncToGitHub: (message?: string) => Promise<{
    success: boolean;
    message: string;
    details?: string;
  }>;
  getAppInfo: () => Promise<BlogAppInfo>;
  getSettings: () => Promise<BlogSettings>;
  updateSettings: (payload: {
    blogRoot: string;
    remoteUrl: string;
    remoteName?: string;
  }) => Promise<{ success: boolean } & BlogSettings>;
  chooseBlogRoot: () => Promise<string | null>;
}

declare global {
  interface Window {
    blogApi: BlogApi;
  }
}
