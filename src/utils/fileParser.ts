import * as XLSX from 'xlsx';
import Papa from 'papaparse';

export interface ItemMasterRow {
  'Item Code': string;
  'Old Code': string;
  'Description': string;
  'UOM': string;
  'Item Type': string;
  'Forecasted': string;
  'Manufacturer': string;
  'Buisness Unit': string;
}

export interface GenConsumableRow {
  'SN': string | number;
  'NUPCO CODE': string;
  'LONG DESCRIPTION': string;
  'UOM': string;
  'GROUP CATEGORY': string;
  'INITIAL QUANTITY': string | number;
}

export const parseExcelFile = async (file: File): Promise<ItemMasterRow[] | GenConsumableRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as ItemMasterRow[] | GenConsumableRow[];
        resolve(jsonData);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const loadExcelFromPath = async <T extends ItemMasterRow | GenConsumableRow>(path: string): Promise<T[]> => {
  try {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet) as T[];
    return jsonData;
  } catch (error) {
    console.error('Error loading Excel file:', error);
    throw error;
  }
};

export const loadCSVFromPath = async <T extends ItemMasterRow | GenConsumableRow>(path: string): Promise<T[]> => {
  try {
    const response = await fetch(path);
    const text = await response.text();
    
    // Use Papa Parse for robust CSV parsing (handles multi-line fields, quotes, etc.)
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        transformHeader: (header: string) => header.trim(),
        transform: (value: string) => value.trim(),
        complete: (results) => {
          console.log(`Parsed ${results.data.length} rows from ${path}`);
          resolve(results.data as T[]);
        },
        error: (error: Error) => {
          console.error('Papa Parse error:', error);
          reject(error);
        }
      });
    });
  } catch (error) {
    console.error('Error loading CSV file:', error);
    throw error;
  }
};
