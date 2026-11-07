import type { Ref } from 'react';

export type SchoolBrowserHandle = { inject: (script: string) => void; reload: () => void };
export type SchoolBrowserProps = {
  ref?: Ref<SchoolBrowserHandle>;
  entry: string;
  onMessage: (data: string, href: string) => void;
  onNavigate: (href: string) => void;
  onError: (message: string) => void;
  onHtml: (html: string) => void;
};
