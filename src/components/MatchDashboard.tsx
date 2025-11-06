'use client';

import { useState, useEffect } from 'react';
import { loadExcelFromPath } from '@/utils/fileParser';
import { matchDescriptionsAsync, MatchResult } from '@/utils/matcher';

export default function MatchDashboard() {
  const [itemMasterData, setItemMasterData] = useState<any[]>([]);
  const [genConsumableData, setGenConsumableData] = useState<any[]>([]);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [minThreshold, setMinThreshold] = useState<number>(60);
  const [error, setError] = useState<string>('');
  const [startTime, setStartTime] = useState<number>(0);

  // Load files automatically on mount
  useEffect(() => {
    const loadFiles = async () => {
      setLoading(true);
      setProgress(0);
      try {
        const [itemData, genData] = await Promise.all([
          loadExcelFromPath('/item-master.xlsx'),
          loadExcelFromPath('/gen-consumables.xlsx')
        ]);
        
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
        setError('Failed to load Excel files. Please make sure the files are in the public folder.');
        setLoading(false);
        setProcessing(false);
      }
    };

    loadFiles();
  }, []);

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
        1000, // Limit to top 1000 matches
        (prog) => setProgress(prog)
      );
      setMatches(results);
      setProcessing(false);
      setProgress(100);
    }
  };

  const getMatchColor = (percentage: number) => {
    if (percentage >= 80) return 'bg-green-100 text-green-800 border-green-300';
    if (percentage >= 60) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (percentage >= 40) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="inline-block animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mb-4"></div>
          <h2 className="text-2xl font-semibold text-gray-800">Loading Excel Files...</h2>
          <p className="text-gray-600 mt-2">Please wait while we load the data</p>
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Item Description Matcher
          </h1>
          <p className="text-gray-600">
            Match descriptions between Item Master and Gen-Consumables files
          </p>
        </div>

        {/* Data Summary & Controls */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">Loaded Data</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Item Master Info */}
            <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
              <div className="flex items-center mb-2">
                <svg className="w-6 h-6 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-semibold text-blue-900">Item Master</h3>
              </div>
              <p className="text-2xl font-bold text-blue-700">{itemMasterData.length} items</p>
              <p className="text-sm text-gray-600 mt-1">item-master.xlsx</p>
            </div>

            {/* Gen-Consumables Info */}
            <div className="bg-purple-50 rounded-lg p-4 border-2 border-purple-200">
              <div className="flex items-center mb-2">
                <svg className="w-6 h-6 text-purple-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <h3 className="text-lg font-semibold text-purple-900">Gen-Consumables</h3>
              </div>
              <p className="text-2xl font-bold text-purple-700">{genConsumableData.length} items</p>
              <p className="text-sm text-gray-600 mt-1">gen-consumables.xlsx</p>
            </div>
          </div>

          {/* Threshold Slider */}
          <div className="mt-6">
            <label className="block text-lg font-medium text-gray-700 mb-2">
              Minimum Match Threshold: {minThreshold}%
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
              <span>50%</span>
              <span>100%</span>
            </div>
            <button
              onClick={() => handleThresholdChange(minThreshold)}
              disabled={processing}
              className="mt-4 w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {processing ? 'Processing...' : 'Re-Match with New Threshold'}
            </button>
          </div>
        </div>

        {/* Results Section */}
        {matches.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
              <h2 className="text-2xl font-semibold text-gray-800">
                Match Results
              </h2>
              <div className="flex flex-col items-end gap-1">
                <span className="bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-semibold">
                  {matches.length} matches found
                </span>
                {matches.length >= 1000 && (
                  <span className="text-xs text-gray-500">
                    Showing top 1000 results
                  </span>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="space-y-4">
                {matches.map((match, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    {/* Match Percentage Badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-gray-500">
                        Match #{index + 1}
                      </span>
                      <span
                        className={`px-4 py-1 rounded-full font-bold text-lg border-2 ${getMatchColor(match.matchPercentage)}`}
                      >
                        {match.matchPercentage}% Match
                      </span>
                    </div>

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
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* No Results Message */}
        {matches.length === 0 && (
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
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
