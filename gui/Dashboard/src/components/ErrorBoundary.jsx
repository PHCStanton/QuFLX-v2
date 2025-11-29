import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 bg-red-900/20 border border-red-700 rounded text-red-200">
          <h2 className="font-bold mb-2">Something went wrong.</h2>
          <p className="text-sm">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children; 
  }
}

export default ErrorBoundary;
