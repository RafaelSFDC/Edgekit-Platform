import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    console.error('ErrorBoundary capturou erro não tratado no frontend:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          resetErrorBoundary={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error?: Error | unknown | null;
  resetErrorBoundary?: () => void;
}

export const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, resetErrorBoundary }) => {
  const [copied, setCopied] = React.useState(false);

  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error
          ? String(error)
          : 'Ocorreu um erro inesperado na interface.';
  const errorStack = error instanceof Error ? error.stack || '' : '';

  const copyDetails = () => {
    const text = `${errorMessage}\n\n${errorStack}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex min-h-svh w-full flex-col items-center justify-center bg-background px-4 py-8 select-none">
      <Card className="w-full max-w-lg border-destructive/40 shadow-lg">
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive border border-destructive/20">
              <AlertCircle className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base text-foreground font-semibold">
                Ops! Algo deu errado no Dashboard
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">
                Uma falha inesperada foi capturada pelo sistema de proteção do Edgekit Platform.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive font-mono break-words">
            {errorMessage}
          </div>

          {errorStack && (
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Rastreamento Técnico (Stack Trace)
              </span>
              <pre className="p-2.5 rounded-lg bg-muted/60 border border-border/80 text-[10px] font-mono text-muted-foreground max-h-36 overflow-x-auto overflow-y-auto select-all">
                {errorStack}
              </pre>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={copyDetails}
            className="text-xs gap-1.5 h-8 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
            <span>{copied ? 'Copiado!' : 'Copiar Erro'}</span>
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.location.href = '/';
              }}
              className="text-xs gap-1.5 h-8 cursor-pointer"
            >
              <Home className="size-3.5" />
              <span>Início</span>
            </Button>

            <Button
              size="sm"
              onClick={resetErrorBoundary ? resetErrorBoundary : () => window.location.reload()}
              className="text-xs gap-1.5 h-8 cursor-pointer bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <RefreshCw className="size-3.5" />
              <span>Tentar Novamente</span>
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};
