import { BarChart2, Upload } from 'lucide-react';

const StatementAnalysisPage = () => {
    return (
        <div className="min-h-screen bg-dashboard-bg text-text-primary p-8 overflow-auto">
            <div className="max-w-5xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-accent-blue/20 rounded-2xl flex items-center justify-center">
                        <BarChart2 className="w-6 h-6 text-accent-blue" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold text-text-primary">Statement Analysis</h1>
                        <p className="text-text-secondary text-sm">Upload your Pocket Option CSV statement to analyse trading performance</p>
                    </div>
                </div>

                <div className="bg-card-bg border border-border-primary rounded-lg p-16 flex flex-col items-center justify-center gap-4 text-center">
                    <div className="w-16 h-16 bg-section-bg rounded-full flex items-center justify-center">
                        <Upload className="w-8 h-8 text-text-secondary" />
                    </div>
                    <h2 className="text-xl font-semibold text-text-primary">Coming Soon</h2>
                    <p className="text-text-secondary max-w-md">
                        Full implementation in progress. This page will let you upload a Pocket Option CSV
                        statement and get detailed analytics on win rates, asset performance, expiry analysis,
                        time-of-day patterns, and AI coaching insights.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StatementAnalysisPage;
