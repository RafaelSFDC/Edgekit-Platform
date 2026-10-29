export type Locale = 'en' | 'pt-BR';

export interface Translations {
  breadcrumbs: {
    home: string;
    overview: string;
    database: string;
    auth: string;
    storage: string;
    realtime: string;
    settings: string;
  };
  sidebar: {
    home: string;
    database: string;
    auth: string;
    storage: string;
    realtime: string;
    settings: string;
    quickSearch: string;
    openApiDocs: string;
  };
  overview: {
    title: string;
    subtitle: string;
    registeredUsers: string;
    d1Tables: string;
    r2Files: string;
    realtimeDO: string;
    cloudflareResources: string;
    connectSnippetTitle: string;
    connectSnippetSubtitle: string;
  };
  database: {
    title: string;
    subtitle: string;
    dataExplorer: string;
    sqlRunner: string;
    tables: string;
    runSql: string;
    executing: string;
    rowsCount: string;
    deleteRowConfirm: string;
    emptyData: string;
  };
  auth: {
    title: string;
    subtitle: string;
    usersCount: string;
    emptyUsers: string;
    statusActive: string;
  };
  storage: {
    title: string;
    subtitle: string;
    uploadFile: string;
    uploading: string;
    dropzone: string;
    filesCount: string;
    emptyFiles: string;
    deleteConfirm: string;
  };
  realtime: {
    title: string;
    subtitle: string;
    channel: string;
    eventName: string;
    payloadJson: string;
    broadcastButton: string;
    liveFeed: string;
    clearFeed: string;
    connected: string;
    connecting: string;
    disconnected: string;
  };
  settings: {
    title: string;
    subtitle: string;
    anonKey: string;
    serviceRoleKey: string;
    jwtSecret: string;
    copy: string;
    copied: string;
    docsLink: string;
  };
  login: {
    title: string;
    subtitle: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    submit: string;
    setupTitle: string;
    setupSubtitle: string;
    nameLabel: string;
    emailLabel: string;
    passwordLabel: string;
    setupSubmit: string;
  };
  common: {
    loading: string;
    search: string;
    actions: string;
    delete: string;
    cancel: string;
    save: string;
    close: string;
    refresh: string;
    success: string;
    error: string;
  };
}
