import { Component, type ReactNode } from 'react';
import { messages, readPreviewLocale } from './locale.js';
import './public-world-preview.css';

export function PublicWorldLoading() {
  const locale = readPreviewLocale();
  return (
    <main
      className="public-preview-loading"
      lang={locale === 'zh' ? 'zh-CN' : 'en'}
      role="status"
    >
      {messages[locale].loading}
    </main>
  );
}

export class PublicWorldErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    const locale = readPreviewLocale();
    return (
      <main
        className="public-preview-loading"
        role="alert"
        lang={locale === 'zh' ? 'zh-CN' : 'en'}
      >
        <div>
          <p>{messages[locale].error}</p>
          <button onClick={() => window.location.reload()}>
            {messages[locale].retry}
          </button>
        </div>
      </main>
    );
  }
}
