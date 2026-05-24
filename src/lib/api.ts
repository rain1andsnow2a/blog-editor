import type { BlogSettings, GitStatus, PostDetail, PostMeta } from '../desktop';

const BASE = '/api';

function hasDesktopApi(): boolean {
  return typeof window !== 'undefined' && typeof window.blogApi !== 'undefined';
}

export async function fetchPosts(): Promise<PostMeta[]> {
  if (hasDesktopApi()) {
    return window.blogApi.listPosts();
  }

  const res = await fetch(`${BASE}/posts`);
  if (!res.ok) throw new Error('Failed to fetch posts');
  return res.json();
}

export async function fetchPost(slug: string): Promise<PostDetail> {
  if (hasDesktopApi()) {
    return window.blogApi.getPost(slug);
  }

  const res = await fetch(`${BASE}/posts/${slug}`);
  if (!res.ok) throw new Error('Failed to fetch post');
  return res.json();
}

export async function createPost(data: {
  slug: string;
  frontmatter: PostDetail['frontmatter'];
  content: string;
}): Promise<{ success: boolean; slug: string }> {
  if (hasDesktopApi()) {
    const result = await window.blogApi.createPost(data);
    return { success: result.success, slug: result.slug };
  }

  const res = await fetch(`${BASE}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create');
  }
  return res.json();
}

export async function updatePost(
  slug: string,
  data: { frontmatter: PostDetail['frontmatter']; content: string }
): Promise<{ success: boolean }> {
  if (hasDesktopApi()) {
    const result = await window.blogApi.updatePost(slug, data);
    return { success: result.success };
  }

  const res = await fetch(`${BASE}/posts/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update');
  }
  return res.json();
}

export async function deletePost(slug: string): Promise<{ success: boolean }> {
  if (hasDesktopApi()) {
    return window.blogApi.deletePost(slug);
  }

  const res = await fetch(`${BASE}/posts/${slug}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete');
  return res.json();
}

export async function uploadImage(file: File): Promise<{ url: string }> {
  if (hasDesktopApi()) {
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    const result = await window.blogApi.uploadImage({
      name: file.name,
      type: file.type,
      bytes,
    });
    return { url: result.url };
  }

  const form = new FormData();
  form.append('image', file);
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Upload failed');
  return res.json();
}

export async function syncToGitHub(
  message?: string
): Promise<{ success: boolean; message: string; details?: string }> {
  if (hasDesktopApi()) {
    return window.blogApi.syncToGitHub(message);
  }

  const res = await fetch(`${BASE}/github/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

export async function getGitStatus(): Promise<GitStatus> {
  if (hasDesktopApi()) {
    return window.blogApi.getGitStatus();
  }

  const res = await fetch(`${BASE}/github/status`);
  if (!res.ok) throw new Error('Failed to get git status');
  return res.json();
}

export async function getSettings(): Promise<BlogSettings> {
  if (hasDesktopApi()) {
    return window.blogApi.getSettings();
  }

  throw new Error('Settings are only available in the desktop app');
}

export async function updateSettings(payload: {
  blogRoot: string;
  remoteUrl: string;
  remoteName?: string;
}): Promise<{ success: boolean } & BlogSettings> {
  if (hasDesktopApi()) {
    return window.blogApi.updateSettings(payload);
  }

  throw new Error('Settings are only available in the desktop app');
}

export async function chooseBlogRoot(): Promise<string | null> {
  if (hasDesktopApi()) {
    return window.blogApi.chooseBlogRoot();
  }

  throw new Error('Settings are only available in the desktop app');
}

export type { BlogSettings, GitStatus, PostDetail, PostMeta };
