'use client';

import { useState, useEffect, useMemo } from 'react';
import { loadCSVFromPath, ItemMasterRow, GenConsumableRow } from '@/utils/fileParser';
import { matchDescriptionsAsync, MatchResult } from '@/utils/matcher';

export default function EnhancedDashboard() {
  const [itemMasterData, setItemMasterData] = useState<ItemMasterRow[]>([]);
  const [genConsumableData, setGenConsumableData] = useState<GenConsumableRow[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [minThreshold, setMinThreshold] = useState<number>(70);
  const [error, setError] = useState<string>('');
  const [startTime, setStartTime] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterQuality, setFilterQuality] = useState<'all' | 'excellent' | 'good' | 'fair' | 'poor'>('all');
  const [showStats, setShowStats] = useState(false);

  // Load files automatically on mount
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true);
      setProgress(0);
      try {
        const [itemData, genData] = await Promise.all([
          loadCSVFromPath<ItemMasterRow>('/Item Master - List of MFG & Trading Items.csv'),
          loadCSVFromPath<GenConsumableRow>('/NPT0001-24-GEN-CONSUMABLES-NURSING-AND-WOUND-CARE-TENDER-ITEMS-LIST.csv')
        ]);
        
        console.log('Item Master data loaded:', itemData.length, 'rows');
        console.log('First Item Master row:', itemData[0]);
        console.log('Gen Consumable data loaded:', genData.length, 'rows');
        console.log('First Gen Consumable row:', genData[0]);
        
        setItemMasterData(itemData);
        setGenConsumableData(genData);
        setLoading(false);
        
        // Automatically perform matching with async version
        setProcessing(true);
        setStartTime(Date.now());
        const results = await matchDescriptionsAsync(
          itemData, 
          genData, 
          minThreshold,
          1000, // Limit to top 1000 matches
          (prog) => setProgress(prog)
        );
        setMatches(results);
        setProcessing(false);
        setProgress(100);
      } catch (err) {
        console.error('Error loading files:', err);
        setError('Failed to load CSV files. Please make sure the files are in the public folder.');
        setLoading(false);
        setProcessing(false);
      }
    };

    loadFiles();
  }, [minThreshold]);

  // Re-match when threshold changes
  const handleThresholdChange = async (newThreshold: number) => {
    setMinThreshold(newThreshold);
    if (itemMasterData.length > 0 && genConsumableData.length > 0) {
      setProcessing(true);
      setProgress(0);
      setStartTime(Date.now());
      const results = await matchDescriptionsAsync(
        itemMasterData, 
        genConsumableData, 
        newThreshold,
        2000,
        (prog) => setProgress(prog)
      );
      setMatches(results);
      setProcessing(false);
      setProgress(100);
    }
  };

  // Analytics calculations
  const analytics = useMemo(() => {
    const matchCounts = {
      excellent: matches.filter(m => m.matchPercentage >= 90).length,
      good: matches.filter(m => m.matchPercentage >= 70 && m.matchPercentage < 90).length,
      fair: matches.filter(m => m.matchPercentage >= 50 && m.matchPercentage < 70).length,
      poor: matches.filter(m => m.matchPercentage < 50).length,
    };
    const avgMatch = matches.length > 0 ? matches.reduce((sum, m) => sum + m.matchPercentage, 0) / matches.length : 0;
    return { matchCounts, avgMatch: avgMatch.toFixed(2), total: matches.length };
  }, [matches]);

  // Filtered matches
  const filteredMatches = useMemo(() => {
    let filtered = [...matches];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(m => 
        m.itemMasterDescription.toLowerCase().includes(term) ||
        m.genConsumableDescription.toLowerCase().includes(term) ||
        m.itemMasterRow['Item Code']?.toLowerCase().includes(term) ||
        m.genConsumableRow['NUPCO CODE']?.toLowerCase().includes(term)
      );
    }
    if (filterQuality !== 'all') {
      filtered = filtered.filter(m => {
        if (filterQuality === 'excellent') return m.matchPercentage >= 90;
        if (filterQuality === 'good') return m.matchPercentage >= 70 && m.matchPercentage < 90;
        if (filterQuality === 'fair') return m.matchPercentage >= 50 && m.matchPercentage < 70;
        if (filterQuality === 'poor') return m.matchPercentage < 50;
        return true;
      });
    }
    return filtered;
  }, [matches, searchTerm, filterQuality]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Match %', 
      'Item Code', 
      'Item Description', 
      'Item UOM', 
      'NUPCO Code', 
      'Gen Description', 
      'Gen UOM',
      'Common Words Count',
      'Common Words',
      'Only in Item Master Count',
      'Only in Item Master',
      'Only in Gen Consumable Count',
      'Only in Gen Consumable'
    ];
    const rows = filteredMatches.map(m => [
      m.matchPercentage,
      m.itemMasterRow['Item Code'] || '',
      m.itemMasterDescription.replace(/,/g, ';'),
      m.itemMasterRow['UOM'] || '',
      m.genConsumableRow['NUPCO CODE'] || '',
      m.genConsumableDescription.replace(/,/g, ';'),
      m.genConsumableRow['UOM'] || '',
      m.differences.commonWords.length,
      m.differences.commonWords.join(' | '),
      m.differences.onlyInItemMaster.length,
      m.differences.onlyInItemMaster.join(' | '),
      m.differences.onlyInGenConsumable.length,
      m.differences.onlyInGenConsumable.join(' | ')
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getMatchColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-green-100 text-green-800 border-green-300';
    if (percentage >= 70) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (percentage >= 50) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
          <h2 className="text-2xl font-semibold text-gray-800">Loading CSV Files...</h2>
          <p className="text-gray-600 mt-2">Please wait while we load the data (much faster than Excel!)</p>
        </div>
      </div>
    );
  }

  if (processing && !loading) {
    const elapsed = Date.now() - startTime;
    const estimatedTotal = progress > 0 ? (elapsed / progress) * 100 : 0;
    const remaining = Math.max(0, estimatedTotal - elapsed);
    const remainingSeconds = Math.ceil(remaining / 1000);
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md w-full mx-4">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mb-4"></div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Matching Descriptions...</h2>
          <div className="w-full bg-gray-200 rounded-full h-4 mb-2">
            <div 
              className="bg-gradient-to-r from-blue-600 to-purple-600 h-4 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-gray-600 font-semibold">{progress}% Complete</p>
          {remainingSeconds > 0 && progress > 5 && (
            <p className="text-sm text-gray-500 mt-2">
              Estimated time remaining: ~{remainingSeconds}s
            </p>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Processing {itemMasterData.length} × {genConsumableData.length} comparisons
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">Error Loading Files</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Top Bar */}
      <div className="bg-white shadow-md border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                🎯 Match Analysis Dashboard
              </h1>
              <p className="text-gray-600 mt-1">Intelligent description matching with advanced analytics</p>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-semibold shadow-md transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV ({filteredMatches.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Performance Info Banner */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-500 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <div className="text-sm">
              <p className="font-semibold text-gray-900">⚡ Optimized for Speed</p>
              <p className="text-gray-700 mt-1">
                Initial threshold set to <span className="font-bold text-blue-600">70%</span> for faster loading. 
                Lower the threshold and click &quot;Re-Analyze&quot; to find more matches.
              </p>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Matches</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{analytics.total}</p>
              </div>
              <div className="bg-blue-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Match Score</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{analytics.avgMatch}%</p>
              </div>
              <div className="bg-green-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Item Master</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{itemMasterData.length}</p>
              </div>
              <div className="bg-purple-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6 border-l-4 border-orange-500 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Gen-Consumables</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{genConsumableData.length}</p>
              </div>
              <div className="bg-orange-100 p-3 rounded-lg">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Match Quality Distribution */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
              <span>📊</span> Match Quality Distribution
            </h3>
            <button 
              onClick={() => setShowStats(!showStats)} 
              className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
            >
              {showStats ? (
                <>
                  <span>Hide</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </>
              ) : (
                <>
                  <span>Show</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </>
              )}
            </button>
          </div>
          {showStats && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">🟢 Excellent (90-100%)</span>
                  <span className="text-sm font-bold text-green-600">{analytics.matchCounts.excellent} matches</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-green-500 h-3 rounded-full transition-all" style={{ width: `${(analytics.matchCounts.excellent / analytics.total) * 100 || 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">🔵 Good (70-89%)</span>
                  <span className="text-sm font-bold text-blue-600">{analytics.matchCounts.good} matches</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-blue-500 h-3 rounded-full transition-all" style={{ width: `${(analytics.matchCounts.good / analytics.total) * 100 || 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">🟡 Fair (50-69%)</span>
                  <span className="text-sm font-bold text-yellow-600">{analytics.matchCounts.fair} matches</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-yellow-500 h-3 rounded-full transition-all" style={{ width: `${(analytics.matchCounts.fair / analytics.total) * 100 || 0}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">🔴 Poor (&lt;50%)</span>
                  <span className="text-sm font-bold text-red-600">{analytics.matchCounts.poor} matches</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div className="bg-red-500 h-3 rounded-full transition-all" style={{ width: `${(analytics.matchCounts.poor / analytics.total) * 100 || 0}%` }}></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Controls & Filters */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span>🎚️</span> Controls & Filters
          </h3>
          
          {/* Search and Filter */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">🔍 Search</label>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by description or code..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">🎯 Quality Filter</label>
              <select
                value={filterQuality}
                onChange={(e) => setFilterQuality(e.target.value as 'all' | 'excellent' | 'good' | 'fair' | 'poor')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Matches</option>
                <option value="excellent">Excellent (90%+)</option>
                <option value="good">Good (70-89%)</option>
                <option value="fair">Fair (50-69%)</option>
                <option value="poor">Poor (&lt;50%)</option>
              </select>
            </div>
          </div>

          {/* Threshold Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Minimum Match Threshold: <span className="text-blue-600 font-bold">{minThreshold}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="100"
              value={minThreshold}
              onChange={(e) => setMinThreshold(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>0%</span>
              <span>25%</span>
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
            <button
              onClick={() => handleThresholdChange(minThreshold)}
              disabled={processing}
              className="mt-4 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {processing ? '⏳ Processing...' : '🔄 Re-Analyze Matches'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {filteredMatches.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
                <span>🔍</span> Match Results
              </h2>
              <div className="flex flex-col items-end gap-1">
                <span className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-semibold">
                  {filteredMatches.length} matches found
                </span>
                {matches.length >= 1000 && (
                  <span className="text-xs text-gray-500">
                    Showing top 1000 results
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {filteredMatches.slice(0, 100).map((match, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg hover:shadow-lg transition-all hover:border-blue-300"
                >
                  {/* Match Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-medium text-gray-500">
                        Match #{index + 1}
                      </span>
                      <span className={`px-4 py-1 rounded-full font-bold text-lg border-2 ${getMatchColor(match.matchPercentage)}`}>
                        {match.matchPercentage}%
                      </span>
                    </div>
                  </div>
                  
                  {/* Match Content */}
                  <div className="p-6">

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Item Master Details */}
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                        <h3 className="font-semibold text-blue-900 mb-3 flex items-center">
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Item Master
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">Item Code:</span>
                            <span className="ml-2 text-gray-900">{match.itemMasterRow['Item Code']}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Description:</span>
                            <p className="ml-2 text-gray-900 mt-1">{match.itemMasterDescription}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <div>
                              <span className="font-medium text-gray-700">UOM:</span>
                              <span className="ml-1 text-gray-900">{match.itemMasterRow['UOM']}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">Item Type:</span>
                              <span className="ml-1 text-gray-900">{match.itemMasterRow['Item Type']}</span>
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Manufacturer:</span>
                            <span className="ml-2 text-gray-900">{match.itemMasterRow['Manufacturer']}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Business Unit:</span>
                            <span className="ml-2 text-gray-900">{match.itemMasterRow['Buisness Unit']}</span>
                          </div>
                        </div>
                      </div>

                      {/* Gen-Consumables Details */}
                      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                        <h3 className="font-semibold text-purple-900 mb-3 flex items-center">
                          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          Gen-Consumables
                        </h3>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="font-medium text-gray-700">NUPCO Code:</span>
                            <span className="ml-2 text-gray-900">{match.genConsumableRow['NUPCO CODE']}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Description:</span>
                            <p className="ml-2 text-gray-900 mt-1">{match.genConsumableDescription}</p>
                          </div>
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            <div>
                              <span className="font-medium text-gray-700">UOM:</span>
                              <span className="ml-1 text-gray-900">{match.genConsumableRow['UOM']}</span>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">SN:</span>
                              <span className="ml-1 text-gray-900">{match.genConsumableRow['SN']}</span>
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Group Category:</span>
                            <span className="ml-2 text-gray-900">{match.genConsumableRow['GROUP CATEGORY']}</span>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Initial Quantity:</span>
                            <span className="ml-2 text-gray-900">{match.genConsumableRow['INITIAL QUANTITY']}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Differences Section */}
                    <div className="mt-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-4 border-2 border-amber-200">
                      <h3 className="font-semibold text-amber-900 mb-3 flex items-center">
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                        </svg>
                        Description Differences Analysis
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {/* Only in Item Master */}
                        <div className="bg-white rounded-lg p-3 border border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">➕</span>
                            <span className="font-semibold text-blue-700">Only in Item Master ({match.differences.onlyInItemMaster.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                            {match.differences.onlyInItemMaster.length > 0 ? (
                              match.differences.onlyInItemMaster.map((word, idx) => (
                                <span key={idx} className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-medium">
                                  {word}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-500 text-xs italic">No unique words</span>
                            )}
                          </div>
                        </div>

                        {/* Only in Gen Consumables */}
                        <div className="bg-white rounded-lg p-3 border border-purple-200">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">➖</span>
                            <span className="font-semibold text-purple-700">Only in Gen Consumables ({match.differences.onlyInGenConsumable.length})</span>
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                            {match.differences.onlyInGenConsumable.length > 0 ? (
                              match.differences.onlyInGenConsumable.map((word, idx) => (
                                <span key={idx} className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs font-medium">
                                  {word}
                                </span>
                              ))
                            ) : (
                              <span className="text-gray-500 text-xs italic">No unique words</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Summary Stats */}
                      <div className="mt-3 pt-3 border-t border-amber-200 flex flex-wrap gap-4 text-xs text-gray-600">
                        <div>
                          <span className="font-medium">Match Accuracy:</span> {match.differences.commonWords.length > 0 
                            ? Math.round((match.differences.commonWords.length / Math.max(match.differences.itemMasterWordCount, match.differences.genConsumableWordCount)) * 100)
                            : 0}% of words match
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {filteredMatches.length > 100 && (
              <div className="mt-6 text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Showing first 100 of {filteredMatches.length} matches</span>
                  <br />
                  <span className="text-xs text-gray-600">Adjust filters or export CSV to see all results</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* No Results Message */}
        {filteredMatches.length === 0 && matches.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No matches found with current filters</h3>
            <p className="text-gray-500">Try adjusting your search term or quality filter</p>
          </div>
        )}

        {/* No Initial Matches Message */}
        {matches.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xl font-semibold text-gray-700 mb-2">No matches found</h3>
            <p className="text-gray-500">Try lowering the minimum match threshold to see more results.</p>
          </div>
        )}
      </div>
    </div>
  );
}
