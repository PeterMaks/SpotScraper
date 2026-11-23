import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] w-full p-6">
          <Card className="w-full max-w-md bg-destructive/10 border-destructive/20">
            <CardHeader>
              <CardTitle className="text-destructive flex items-center gap-2">
                <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Something went wrong
              </CardTitle>
              <CardDescription className="text-destructive/80">
                An unexpected error occurred in this section of the application.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="text-xs text-destructive/80 overflow-auto max-h-32 p-3 bg-destructive/5 rounded-md">
                {this.state.error?.message || 'Unknown error'}
              </pre>
            </CardContent>
            <CardFooter>
              <Button 
                variant="outline" 
                className="w-full border-destructive/30 hover:bg-destructive/10"
                onClick={() => this.setState({ hasError: false, error: null })}
              >
                Try Again
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
