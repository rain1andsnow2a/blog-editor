const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApi', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedChange: (callback) => {
    const listener = (_event, isMaximized) => callback(isMaximized);
    ipcRenderer.on('window:maximized-changed', listener);
    return () => ipcRenderer.removeListener('window:maximized-changed', listener);
  },
});

contextBridge.exposeInMainWorld('blogApi', {
  listPosts: () => ipcRenderer.invoke('posts:list'),
  getPost: (slug) => ipcRenderer.invoke('posts:get', slug),
  createPost: (payload) => ipcRenderer.invoke('posts:create', payload),
  updatePost: (slug, payload) => ipcRenderer.invoke('posts:update', slug, payload),
  deletePost: (slug) => ipcRenderer.invoke('posts:delete', slug),
  publishPost: (slug) => ipcRenderer.invoke('posts:publish', slug),
  withdrawPost: (slug) => ipcRenderer.invoke('posts:withdraw', slug),
  listDrafts: () => ipcRenderer.invoke('drafts:list'),
  restoreDraft: (slug) => ipcRenderer.invoke('drafts:restore', slug),
  deleteDraft: (slug) => ipcRenderer.invoke('drafts:delete', slug),
  uploadImage: (payload) => ipcRenderer.invoke('images:upload', payload),
  getGitStatus: () => ipcRenderer.invoke('git:status'),
  syncToGitHub: (message) => ipcRenderer.invoke('git:sync', message),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload) => ipcRenderer.invoke('settings:update', payload),
  chooseBlogRoot: () => ipcRenderer.invoke('settings:chooseBlogRoot'),
});
