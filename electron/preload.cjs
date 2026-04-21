const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blogApi', {
  listPosts: () => ipcRenderer.invoke('posts:list'),
  getPost: (slug) => ipcRenderer.invoke('posts:get', slug),
  createPost: (payload) => ipcRenderer.invoke('posts:create', payload),
  updatePost: (slug, payload) => ipcRenderer.invoke('posts:update', slug, payload),
  deletePost: (slug) => ipcRenderer.invoke('posts:delete', slug),
  uploadImage: (payload) => ipcRenderer.invoke('images:upload', payload),
  getGitStatus: () => ipcRenderer.invoke('git:status'),
  syncToGitHub: (message) => ipcRenderer.invoke('git:sync', message),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (payload) => ipcRenderer.invoke('settings:update', payload),
  chooseBlogRoot: () => ipcRenderer.invoke('settings:chooseBlogRoot'),
});
