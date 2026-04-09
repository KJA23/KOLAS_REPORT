// ...existing code...
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import ChartDataLabels from 'chartjs-plugin-datalabels';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, ChartDataLabels);
import { Pie } from 'react-chartjs-2';
// ChartDataLabels is already registered globally, no need to pass as plugins prop
import { useDropzone } from 'react-dropzone';
// import OpenAI from "openai";
import { 
  FileText, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Table as TableIcon,
  Info,
  FileCode,
  Download,
  PlusCircle,
  Trash2,
  Search,
  Database,
  ChevronRight
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import Login from './Login';

// --- Types ---

interface AnalysisResult {
  id: number; // int8 (bigint)
  gubun_code?: string;
  Report_No?: string;
  created_at?: string; // Supabase 자동 생성
  companyName?: string;
  representativeDomain?: string;
  mainTechField?: string;
  productName?: string;
  overview?: string;
  Test_Item?: string;
  Parameter?: string;
  testResult?: string;
  AI_Domain?: string;
  AI_Tech?: string;
  Metrics?: string; // AI가 추가로 분석해서 반환하는 주요 지표 (선택적) - 예: 정확도, F1 점수 등
  EQ?: string; // AI가 분석해서 반환하는 주요 장비 정보 (선택적) - 예: 사용된 시험 장비 모델명 등
}

const FIELD_LABELS: Record<keyof Omit<AnalysisResult, 'id'>, string> = {
  gubun_code: "대분류",
  Report_No: "보고서 번호",
  created_at: "생성일(미노출)",
  companyName: "업체명",
  representativeDomain: "대표 도메인",
  mainTechField: "주요기술 분야",
  productName: "제품명",
  overview: "개요",
  Test_Item: "시험항목",
  Parameter: "신청기관 기준",
  testResult: "시험결과",
  AI_Domain: "도메인(AI)추천",
  AI_Tech: "적용기술(AI)추천",
  Metrics: "주요 지표(미노출)",
  EQ: "산식(미노출)"
};

const API_BASE_URL = 'https://kolas-report.onrender.com';

// Supabase 클라이언트 생성
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- App Component ---

export default function App() {
  // 로그인 ID 상태는 isLoggedIn과 별도 관리
  const [loginId, setLoginId] = useState<string | null>(() => localStorage.getItem('login_id'));
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    // 세션 만료 체크
    const expire = localStorage.getItem('session_expire');
    if (expire && Date.now() < Number(expire)) {
      return true;
    }
    localStorage.removeItem('session_expire');
    return false;
  });
    // 세션 만료 타이머
    React.useEffect(() => {
      if (!isLoggedIn) return;
      const interval = setInterval(() => {
        const expire = localStorage.getItem('session_expire');
        if (!expire || Date.now() > Number(expire)) {
          localStorage.removeItem('session_expire');
          setIsLoggedIn(false);
          alert('세션이 만료되어 자동 로그아웃되었습니다.');
        }
      }, 10000); // 10초마다 체크
      return () => clearInterval(interval);
    }, [isLoggedIn]);

    // 누적 결과 행 선택 상태 및 선택 삭제 함수
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

    // 검색/필터 상태
    const [searchType, setSearchType] = useState<'전체' | '기관명' | '대표 도메인'>('전체');
    const [searchText, setSearchText] = useState(''); // 실제 검색어(검색 버튼 눌러야 반영)
    const [searchInput, setSearchInput] = useState(''); // 입력창 값

    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<AnalysisResult[] | null>(null);
    const [accumulatedResults, setAccumulatedResults] = useState<AnalysisResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [activeTab, setActiveTab] = useState<'analyze' | 'accumulated' | 'summary'>('summary');

    // 누적 결과 검색/필터링 결과
    const filteredResults = React.useMemo(() => accumulatedResults.filter(row => {
      if (!searchText.trim()) return true;
      const text = searchText.trim().toLowerCase();
      if (searchType === '전체') {
        // 기관명, 대표 도메인 모두 포함하여 검색
        return (
          (row.companyName && row.companyName.toLowerCase().includes(text)) ||
          (row.representativeDomain && row.representativeDomain.toLowerCase().includes(text))
        );
      } else if (searchType === '기관명') {
        return row.companyName && row.companyName.toLowerCase().includes(text);
      } else if (searchType === '대표 도메인') {
        return row.representativeDomain && row.representativeDomain.toLowerCase().includes(text);
      }
      return true;
    }), [accumulatedResults, searchText, searchType]);

    const deleteSelected = async () => {
      if (selectedIds.size === 0) return;
      if (!window.confirm('선택한 행을 삭제하시겠습니까?')) return;
      try {
        const { error } = await supabase
          .from('analysis_results')
          .delete()
          .in('id', Array.from(selectedIds));
        if (error) throw error;
        setAccumulatedResults(prev => prev.filter(r => !selectedIds.has(r.id)));
        setSelectedIds(new Set());
      } catch (err: any) {
        console.error(err);
        setError(err?.message || '선택 삭제 중 오류가 발생했습니다.');
      }
    };

  const fetchAccumulated = async () => {
    try {
      // 예시: 'results' 테이블에서 전체 데이터 조회
      const { data, error } = await supabase
        .from('analysis_results')
        .select('*')
        .order('id', { ascending: false });
      if (error) throw error;
      setAccumulatedResults(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    }
  };

  useEffect(() => {
    fetchAccumulated();
  }, []);


  const onDrop = useCallback((acceptedFiles: File[]) => {
    const selectedFile = acceptedFiles[0];
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    if (selectedFile && allowedTypes.includes(selectedFile.type)) {
      setFile(selectedFile);
      setError(null);
      setResults(null);
    } else {
      setError('PDF 또는 Word(docx) 파일만 업로드 가능합니다.');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc']
    },
    multiple: false
  });

  const analyzeReport = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      // Gemini 분석 API만 사용
      let contentPart: any;
      if (file.type === 'application/pdf') {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.readAsDataURL(file);
        });
        const base64Data = await base64Promise;
        contentPart = {
          inlineData: {
            mimeType: "application/pdf",
            data: base64Data
          }
        };
      } else {
        // Word file processing
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const text = result.value;
        if (!text || text.trim().length === 0) {
          throw new Error("Word 파일에서 텍스트를 추출할 수 없습니다.");
        }
        contentPart = {
          text: `다음은 시험성적서 문서의 텍스트 내용입니다:\n\n${text}`
        };
      }

      // Gemini 프록시 엔드포인트로 요청 (백엔드와 일치)
      const GEMINI_PROXY_URL = `${API_BASE_URL}/gemini-analyze`;
      // AI가 반드시 모든 필드를 포함한 JSON 배열로 반환하도록 프롬프트를 명확하게 작성
      // 파일명에서 마지막 점(.)을 기준으로 확장자만 제거 (Report_No 용)
      let fileName = '';
      if (file && file.name) {
        const match = file.name.match(/^(.*)\.[^.]+$/);
        fileName = match ? match[1] : file.name;
      }
      const prompt = `아래는 시험성적서의 텍스트입니다.\n${contentPart.text || ''}\n\n이 내용을 분석하여 시험항목별로 아래의 모든 필드를 포함하는 JSON 배열을 반환하세요.\n\n[\n  {\n    \\"Report_No\\": \\",\\",\n    \\"created_at\\": \\",\\",\n    \\"companyName\\": \\",\\",\n    \\"representativeDomain\\": \\",\\",\n    \\"mainTechField\\": \\",\\",\n    \\"productName\\": \\",\\",\n    \\"overview\\": \\",\\",\n    \\"Test_Item\\": \\",\\",\n    \\"Parameter\\": \\",\\",\n    \\"testResult\\": \\",\\",\n    \\"AI_Domain\\": \\",\\",\n    \\"AI_Tech\\": \\",\\"\n  }\n]\n\n각 항목에 맞는 값을 채워서 반드시 위와 같은 JSON 배열만 반환하세요.\nReport_No 필드는 반드시 파일명에서 확장자를 제외한 부분(예: ${fileName})으로 채우세요.\nrepresentativeDomain 필드는 단순히 문서에 적힌 값을 복사하지 말고, 각 시험항목의 특성과 내용을 분석하여 가장 적합한 산업분야(예: 전자, 화학, 기계, 의료, 식품 등)로 AI가 직접 분류해서 입력하세요.\ncreated_at에는 반드시 시험성적서의 발급일(날짜/시간)을 ISO 8601 형식(예: 2024-03-26T12:34:56Z)으로 입력하세요. 시험성적서 내에 발급일이 없으면 빈 문자열로 두세요. 한국어로 답변하지 말고, JSON 데이터만 반환하세요.`;
      const response = await fetch(GEMINI_PROXY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });
      if (!response.ok) {
        // 상세 에러 메시지 표시
        const errorText = await response.text();
        throw new Error(`Gemini 프록시 호출 실패: ${response.status} ${response.statusText} - ${errorText}`);
      }
      const data = await response.json();
      // Gemini 응답에서 JSON 배열 추출 및 파싱 개선
      let textResponse = data.generated_text || data.candidates?.[0]?.content || data.text || JSON.stringify(data);
      let parsedResult: AnalysisResult[] = [];
      if (textResponse) {
        // 만약 textResponse가 객체라면 string으로 변환
        if (typeof textResponse !== 'string') {
          textResponse = JSON.stringify(textResponse);
        }
        const jsonMatch = textResponse.match(/\[.*\]/s);
        const jsonString = jsonMatch ? jsonMatch[0] : textResponse;
        try {
          parsedResult = JSON.parse(jsonString);
        } catch (e) {
          setError('AI 응답에서 JSON을 추출하지 못했습니다.\n원본 응답: ' + textResponse);
          setResults([]);
          setLoading(false);
          return;
        }
        // 결과가 배열이 아니면 빈 배열 처리
        if (!Array.isArray(parsedResult)) {
          setError('AI 응답이 배열 형식이 아닙니다.\n원본 응답: ' + textResponse);
          setResults([]);
          setLoading(false);
          return;
        }
        // Report_No가 없거나 '-'인 경우 파일명으로 대체
        // AI_Domain, AI_Tech이 없거나 비어있으면 대표값 자동 입력
        // 산업 도메인 분류 기준
        const getRepresentativeAIDomain = (row: any) => {
          // 기본 도메인 추천: 조건이 없으면 '일반 도메인' 반환
          const text = `${row.mainTechField || ''} ${row.productName || ''} ${row.Test_Item || ''}`.toLowerCase();
          if (/vision|이미지|영상|camera|photo|picture|object|detect|recognition|분류|classification/.test(text)) return '컴퓨터 비전';
          if (/language|text|자연어|nlp|문자|문서|translation|summarization|분석|감정|sentiment/.test(text)) return '자연어 처리';
          if (/recommend|추천|personalization|추천시스템/.test(text)) return '추천 시스템';
          if (/speech|음성|voice|audio|sound/.test(text)) return '음성/오디오';
          if (/robot|로봇|제어|control|autonomous|자율/.test(text)) return '로보틱스';
          if (/anomaly|이상|탐지|detect|fraud|이상탐지/.test(text)) return '이상탐지';
          if (/forecast|예측|prediction|시계열|time series/.test(text)) return '시계열 예측';
          return '일반 도메인';
        };
        //주요기술 분류 기준
        const getRepresentativeAITech = (row: any) => {
          // 주요기술 분류 예시 반영: 메타버스, 블록체인, AI 기술, 플랫폼(WEB, APP, 모바일, 임베디드), 피지컬 AI 등
          const text = `${row.mainTechField || ''} ${row.productName || ''} ${row.Test_Item || ''}`.toLowerCase();
          if (/metaverse|메타버스/.test(text)) return '메타버스';
          if (/blockchain|블록체인/.test(text)) return '블록체인';
          if (/ai|artificial intelligence|인공지능/.test(text)) return 'AI 기술';
          if (/web|웹|app|앱|mobile|모바일|embedded|임베디드|platform|플랫폼/.test(text)) return '플랫폼(WEB, APP, 모바일, 임베디드)';
          if (/physical ai|피지컬 ai/.test(text)) return '피지컬 AI';
          if (/classification|분류|detect|recognition|object|이미지|vision|camera/.test(text)) return '이미지 분류';
          if (/detection|탐지|anomaly|이상|detect|fraud/.test(text)) return '이상탐지';
          if (/nlp|text|자연어|summarization|요약|translation|번역/.test(text)) return '텍스트 요약';
          if (/recommend|추천|personalization/.test(text)) return '추천 시스템';
          if (/speech|음성|voice|audio/.test(text)) return '음성 인식';
          if (/forecast|예측|prediction|시계열|time series/.test(text)) return '시계열 예측';
          if (/clustering|군집|cluster/.test(text)) return '군집화';
          if (/regression|회귀/.test(text)) return '회귀분석';
          return '기타';
        };
        const fixedResult = parsedResult.map((row) => ({
          ...row,
          Report_No: (!row.Report_No || row.Report_No === '-') ? fileName : row.Report_No,
          AI_Domain: row.AI_Domain && row.AI_Domain.trim() ? row.AI_Domain : getRepresentativeAIDomain(row),
          AI_Tech: row.AI_Tech && row.AI_Tech.trim() ? row.AI_Tech : getRepresentativeAITech(row),
          testResult: (() => {
            // '적합', '부적합', 괄호 제거
            if (!row.testResult) return row.testResult;
            let result = row.testResult.trim();
            if (result === '적합' || result === '부적합') return '';
            result = result.replace(/적합/g, '').replace(/부적합/g, '');
            // 괄호 및 괄호 안 내용 제거
            result = result.replace(/[()]/g, '');
            return result.trim();
          })(),
          gubun_code: (() => {
            const reportNo = ((!row.Report_No || row.Report_No === '-') ? fileName : row.Report_No) || '';
            const hasC = reportNo.includes('C');
            const hasK = reportNo.includes('K');
            const hasAI = reportNo.includes('AI');
            const hasB = reportNo.includes('B');
            if (hasK) return 'KOLAS 시험성적서';
            if (hasAI && hasB) return 'KOLAS 시험성적서';
            if (hasC && hasAI) return '일반 AI 성적서';
            if (hasC && !hasAI) return '일반 성적서';
            return '';
          })(),
          Metrics: (() => {
            const reportNo = ((!row.Report_No || row.Report_No === '-') ? fileName : row.Report_No) || '';
            const gubun = (() => {
              const hasC = reportNo.includes('C');
              const hasK = reportNo.includes('K');
              const hasAI = reportNo.includes('AI');
              const hasB = reportNo.includes('B');
              if (hasK) return 'KOLAS 시험성적서';
              if (hasAI && hasB) return 'KOLAS 시험성적서';
              if (hasC && hasAI) return '일반 AI 성적서';
              if (hasC && !hasAI) return '일반 성적서';
              return '';
            })();
            if ((gubun === '일반 AI 성적서' || (gubun === 'KOLAS 시험성적서' && reportNo.includes('AI')))) {
              return row.Metrics && row.Metrics.trim() ? row.Metrics : '정확도, F1 점수 등 AI 성능 지표';
            }
            return row.Metrics;
          })(),
          EQ: (() => {
            const reportNo = ((!row.Report_No || row.Report_No === '-') ? fileName : row.Report_No) || '';
            const gubun = (() => {
              const hasC = reportNo.includes('C');
              const hasK = reportNo.includes('K');
              const hasAI = reportNo.includes('AI');
              const hasB = reportNo.includes('B');
              if (hasK) return 'KOLAS 시험성적서';
              if (hasAI && hasB) return 'KOLAS 시험성적서';
              if (hasC && hasAI) return '일반 AI 성적서';
              if (hasC && !hasAI) return '일반 성적서';
              return '';
            })();
            if ((gubun === '일반 AI 성적서' || (gubun === 'KOLAS 시험성적서' && reportNo.includes('AI')))) {
              return row.EQ && row.EQ.trim() ? row.EQ : 'AI 산식 또는 모델 정보';
            }
            return row.EQ;
          })()
        }));
        setResults(fixedResult);
      } else {
        throw new Error("분석 결과를 가져오지 못했습니다.");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const addToAccumulated = async () => {
    if (!results) return;
    try {
      // 누적 데이터 중에 동일한 Report_No가 있는지 확인
      const reportNoSet = new Set(accumulatedResults.map(r => r.Report_No));
      const nonDuplicateResults = results.filter(r => !(r.Report_No && reportNoSet.has(r.Report_No)));
      if (nonDuplicateResults.length === 0) {
        setError('이미 분석된 보고서 번호가 있습니다. 중복된 결과는 저장할 수 없습니다.');
        return;
      }
      // Supabase에 중복이 아닌 results만 insert
      const { data, error } = await supabase
        .from('analysis_results')
        .insert(nonDuplicateResults)
        .select();
      if (error) {
        setError(`Supabase 저장 오류: ${error.message || JSON.stringify(error)}`);
        return;
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      // 누적 결과를 즉시 반영 (fetchAccumulated 대신)
      setAccumulatedResults(prev => [...(data || nonDuplicateResults), ...prev]);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || '결과를 저장하는 중 오류가 발생했습니다.');
    }
  };

  const exportToExcel = () => {
    if (accumulatedResults.length === 0) return;

    // Create data with headers
    const dataToExport = accumulatedResults.map(row => {
      const newRow: any = {};
      (Object.keys(FIELD_LABELS) as (keyof Omit<AnalysisResult, 'id'>)[]).forEach(key => {
        newRow[FIELD_LABELS[key]] = row[key];
      });
      return newRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Analysis Results");
    
    // Generate filename with current date
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Test_Report_Analysis_${date}.xlsx`);
  };

  const clearAccumulated = async () => {
    if (window.confirm("누적된 모든 데이터를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      try {
        const { error } = await supabase
          .from('analysis_results')
          .delete()
          .neq('id', 0); // 모든 행 삭제
        if (error) throw error;
        setAccumulatedResults([]);
      } catch (err: any) {
        console.error(err);
        setError(err?.message || '결과를 삭제하는 중 오류가 발생했습니다.');
      }
    }
  };


  // 로그아웃 함수
  const handleLogout = () => {
    localStorage.removeItem('session_expire');
    localStorage.removeItem('login_id');
    setIsLoggedIn(false);
    setLoginId(null);
  };

  if (!isLoggedIn) {
    return <Login onLogin={(id?: string) => {
      // 로그인 성공 시 세션 만료 시간 갱신
      const expire = Date.now() + 60 * 60 * 1000;
      localStorage.setItem('session_expire', expire.toString());
      if (id) {
        localStorage.setItem('login_id', id);
        setLoginId(id);
      } else {
        // 기존 방식: login_id가 없는 경우에도 localStorage에서 가져옴
        const storedId = localStorage.getItem('login_id');
        setLoginId(storedId);
      }
      setIsLoggedIn(true);
    }} />;
  }


  return (
    <div className="min-h-screen bg-white text-[#141414] font-sans p-6 md:p-12">
      {/* 최상단 왼쪽: 로그아웃 + 로그인 ID */}
      <div className="fixed top-4 right-4 z-50 flex items-center gap-3">
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-lg bg-blue-500 text-white font-bold text-sm hover:bg-blue-600 transition-all border border-blue-600 shadow"
        >
          로그아웃
        </button>
        {loginId && (
          <span className="text-[#2563eb] font-bold text-base bg-white/80 px-3 py-1 rounded border border-[#2563eb]/30 shadow">
            {loginId} 님
          </span>
        )}
      </div>

      <div className="w-[95vw] mx-auto text-[#1e3a8a]">
        {/* Header */}
        <header className="mb-8 border-b border-[#141414] pb-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <FileText className="w-8 h-8" />
                <h1 className="text-4xl font-bold tracking-tighter uppercase text-[#1e208a]">시험 성적서 분석기</h1>
              </div>
                <p className="text-[#1e208a]/70 ">
                <b>시험성적서(PDF, Word)를 업로드하여 시험항목별 주요 지표를 분석합니다.</b>
              </p>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex bg-[#141414]/5 p-1 rounded-xl border border-[#141414]/10">
              <button
                onClick={() => setActiveTab('summary')}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all cursor-pointer
                  ${activeTab === 'summary' 
                    ? 'bg-[#2563eb] text-white shadow-lg' 
                    : 'text-[#2563eb]/70 hover:text-[#2563eb] hover:bg-[#2563eb]/10'}
                `}
              >
                <TableIcon className="w-4 h-4" />
                시험 분석결과
              </button>
              <button
                onClick={() => setActiveTab('analyze')}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all cursor-pointer
                  ${activeTab === 'analyze' 
                    ? 'bg-[#2563eb] text-white shadow-lg' 
                    : 'text-[#2563eb]/70 hover:text-[#2563eb] hover:bg-[#2563eb]/10'}
                `}
              >
                <Search className="w-4 h-4" />
                성적서 분석
              </button>
              <button
                onClick={() => setActiveTab('accumulated')}
                className={`
                  flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm transition-all relative cursor-pointer
                  ${activeTab === 'accumulated' 
                    ? 'bg-[#2563eb] text-white shadow-lg' 
                    : 'text-[#2563eb]/70 hover:text-[#2563eb] hover:bg-[#2563eb]/10'}
                `}
              >
                <Database className="w-4 h-4" />
                누적 결과 확인
                {accumulatedResults.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-[#E4E3E0]">
                    {accumulatedResults.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </header>

        <main className="space-y-12">
          <AnimatePresence mode="wait">
            {activeTab === 'analyze' ? (
              <motion.div
                key="analyze"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-12"
              >
                {/* Upload Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div 
                    {...getRootProps()} 
                    className={`
                      border-2 border-dashed p-8 rounded-lg transition-all cursor-pointer
                      flex flex-col items-center justify-center text-center gap-4
                      ${isDragActive ? 'border-[#141414] bg-[#141414]/5' : 'border-[#141414]/20 hover:border-[#141414]/40'}
                      ${file ? 'bg-white/50 border-solid border-[#141414]/40' : ''}
                    `}
                  >
                    <input {...getInputProps()} />
                    <div className="w-12 h-12 bg-[#141414] rounded-full flex items-center justify-center text-white">
                      {file ? (
                        file.type.includes('word') ? <FileCode className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6" />
                      ) : (
                        <Upload className="w-6 h-6" />
                      )}
                    </div>
                    <div>
                      <p className="font-bold">
                        {file ? file.name : "성적서 PDF / Word 업로드"}
                      </p>
                      <p className="text-xs opacity-60">
                        {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF 또는 docx 파일을 드래그하거나 클릭하세요"}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center gap-3">
                    <div className="flex gap-3">
                      <button
                        onClick={analyzeReport}
                        disabled={!file || loading}
                        className={`
                          flex-1 py-4 px-6 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2 cursor-pointer
                          ${!file || loading 
                            ? 'bg-[#2563eb]/10 text-[#2563eb]/30 cursor-not-allowed' 
                            : 'bg-[#2563eb] text-white hover:scale-[1.02] active:scale-[0.98]'}
                        `}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            분석 중...
                          </>
                        ) : (
                          "분석 시작하기"
                        )}
                      </button>
                      
                      {file && !loading && (
                        <button
                          onClick={() => {
                            setFile(null);
                            setResults(null);
                            setError(null);
                          }}
                          className="px-6 py-4 border-2 border-[#2563eb] rounded-lg font-bold hover:bg-[#2563eb] hover:text-white transition-all cursor-pointer"
                        >
                          초기화
                        </button>
                      )}
                    </div>
                    {error && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3 text-red-700">
                        <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                        <p className="text-sm">{error}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Result Section */}
                <div className="w-full">
                  <AnimatePresence mode="wait">
                    {results ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-white rounded-lg shadow-2xl overflow-hidden border border-[#141414]/10"
                      >
                        <div className="bg-[#2563eb] text-white p-4 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TableIcon className="w-5 h-5" />
                            <span className="font-bold uppercase tracking-widest text-sm">분석 결과</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={addToAccumulated}
                              className={`
                                flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-lg border-2 cursor-pointer
                                ${saveSuccess 
                                  ? 'bg-green-600 border-green-700 text-white' 
                                  : 'bg-[#1d3bb8] border-[#1d3bb8] text-white hover:bg-[#14308a] hover:border-[#0e1a4d]'}
                                outline-none focus:ring-2 focus:ring-[#14308a]
                              `}
                            >
                              {saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <PlusCircle className="w-4 h-4" />}
                              {saveSuccess ? "누적 완료" : "결과 누적하기"}
                            </button>
                            <span className="text-[15px] opacity-50  text-white">COUNT: {results.length}</span>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[#141414] text-base">
                            <colgroup>
                              <col /> {/* NO */}
                              <col /> {/* 보고서 번호 */}
                              <col /> {/* 기관명 */}
                              <col /> {/* 보고서 종류 */}
                              <col /> {/* 발급 일자 */}
                              <col /> {/* 시험성적서 날짜 */}
                              {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
                                .filter(key => !['created_at','Metrics','EQ','companyName','gubun_code','Report_No'].includes(key))
                                .map((key, idx) => (
                                  <col key={key} />
                                ))}
                            </colgroup>
                            <thead>
                              <tr className="bg-[#2563eb]/10 border-b border-[#2563eb]/30">
                                <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">NO</th>
                                <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">보고서 번호</th>
                                <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">기관명</th>
                                <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">보고서 종류</th>
                                <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">발급 일자</th>
                                <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">시험성적서 날짜</th>
                                {(Object.entries(FIELD_LABELS)
                                  .filter(([key]) => !['created_at','Metrics','EQ','companyName','gubun_code','Report_No'].includes(key))
                                  .map(([key, label], idx) => (
                                    <th key={label} className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 last:border-r-0 text-left">
                                      {label}
                                    </th>
                                  )))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-[#141414]/10">
                              {results.map((row, idx) => (
                                <tr key={idx} className="hover:bg-[#141414]/5 transition-colors group">
                                  <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{idx + 1}</td>
                                  <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{row.Report_No || '-'}</td>
                                  <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{row.companyName || '-'}</td>
                                  <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{(() => {
                                    const aiKeywords = [
                                      'AI', 'ai', '인공지능', '딥러닝', '머신러닝', '생성형', '예측', '추천', 'classification', 'vision', 'nlp', '자연어', '음성', 'f1', '정확도', '모델', '딥러닝', '신경망', 'transformer', 'gpt', 'llm', '생성', '분류', '탐지', '군집', '회귀', '예측', '추천', 'summarization', '요약', 'translation', '번역', '음성', 'audio', 'speech', '시계열', 'forecast', 'prediction'
                                    ];
                                    const text = `${row.AI_Tech || ''} ${row.AI_Domain || ''} ${row.mainTechField || ''} ${row.productName || ''} ${row.Test_Item || ''}`.toLowerCase();
                                    return aiKeywords.some(k => text.includes(k.toLowerCase())) ? 'AI' : '일반 SW';
                                  })()}</td>
                                  <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{row.created_at ? new Date(row.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}</td>
                                  <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{(() => {
                                    const techMap = [
                                      { label: '교육', keywords: ['교육', 'education', '학습', 'e-learning', '강의', '수업'] },
                                      { label: '대시보드', keywords: ['대시보드', 'dashboard', '시각화', 'visualization', '모니터링'] },
                                      { label: '관리', keywords: ['관리', 'management', '운영', 'admin', '관리자', '통제'] },
                                      { label: '예측', keywords: ['예측', 'prediction', 'forecast', '시계열', '미래', '추정'] },
                                      { label: '추천', keywords: ['추천', 'recommend', 'personalization', '추천시스템'] },
                                      { label: '생성형', keywords: ['생성', 'generation', '생성형', 'gpt', 'llm', '요약', 'summarization', '번역', 'translation'] },
                                      { label: '분류', keywords: ['분류', 'classification', 'classify'] },
                                      { label: '탐지', keywords: ['탐지', 'detection', 'detect', '이상', 'anomaly', 'fraud'] },
                                      { label: '군집', keywords: ['군집', 'clustering', 'cluster'] },
                                      { label: '회귀', keywords: ['회귀', 'regression'] },
                                      { label: '음성', keywords: ['음성', 'speech', 'audio'] },
                                      { label: '자연어', keywords: ['자연어', 'nlp', 'text', '문자', '문서'] },
                                      { label: '로보틱스', keywords: ['로봇', 'robot', '제어', 'control', 'autonomous', '자율'] },
                                    ];
                                    const text = `${row.Test_Item || ''}`.toLowerCase();
                                    const found = techMap.filter(t => t.keywords.some(k => text.includes(k.toLowerCase()))).map(t => t.label);
                                    return found.length > 0 ? found.join(', ') : '-';
                                  })()}</td>
                                  {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
                                    .filter(key => !['created_at','Metrics','EQ','companyName','gubun_code','Report_No'].includes(key))
                                    .map((key, colIdx) => (
                                      <td key={key} className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 last:border-r-0 align-top">
                                        <div className="whitespace-pre-wrap">
                                          {key === 'testResult' && row[key]
                                            ? String(row[key]).replace(/[()]/g, '')
                                            : row[key] || "-"}
                                        </div>
                                      </td>
                                    ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </motion.div>
                    ) : (
                      <div className="h-full min-h-75 border-2 border-dashed border-[#141414]/10 rounded-lg flex flex-col items-center justify-center text-[#141414]/30">
                        {loading ? (
                          <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-[#141414]/10 border-t-[#141414] rounded-full animate-spin" />
                            <p className="font-serif italic">데이터를 추출하고 있습니다...</p>
                          </div>
                        ) : (
                          <>
                            <TableIcon className="w-12 h-12 mb-4 opacity-20" />
                            <p className="font-serif italic text-lg">분석 결과가 여기에 표 형식으로 표시됩니다.</p>
                          </>
                        )}
                      </div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Quick Link to Accumulated */}
                {accumulatedResults.length > 0 && results && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-center"
                  >
                    <button
                      onClick={() => setActiveTab('accumulated')}
                      className="flex items-center gap-2 text-sm font-bold text-[#1e3a8a]/70 hover:text-[#1e3a8a] transition-all group cursor-pointer"
                    >
                      누적된 결과 확인하러 가기
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </button>
                  </motion.div>
                )}
              </motion.div>
            ) : activeTab === 'accumulated' ? (
              <motion.div
                key="accumulated"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {accumulatedResults.length > 0 ? (
                  <>




                    {/* 검색/필터 영역 - 분석 결과표 위, 오른쪽 정렬 */}

                    {/* 검색/필터 영역 - 엑셀 다운로드 버튼 아래, 오른쪽 정렬 */}
                    <div className="flex justify-end mt-2 mb-4">
                      <div className="flex items-center gap-2">
                        <select
                          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          value={searchType}
                          onChange={e => setSearchType(e.target.value as any)}
                        >
                          <option value="전체">전체</option>
                          <option value="기관명">기관명</option>
                          <option value="대표 도메인">대표 도메인</option>
                        </select>
                        <input
                          className="border rounded-lg px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-400"
                          type="text"
                          placeholder={searchType === '전체' ? '검색어를 입력하세요' : `${searchType} 입력`}
                          value={searchInput}
                          onChange={e => setSearchInput(e.target.value)}
                        />
                        <button
                          className="ml-1 cursor-pointer hover:bg-blue-50 rounded p-1"
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSearchText(searchInput)}
                          aria-label="검색"
                        >
                          <Search className="w-4 h-4 text-[#3359c2]" />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-[#3359c2] text-white p-8 rounded-2xl shadow-xl">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                          <Database className="w-8 h-8" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold uppercase tracking-tight">누적 데이터 관리</h2>
                          <p className="text-white/60 font-serif italic">총 {filteredResults.length}개의 시험항목 데이터가 검색되었습니다.</p>
                        </div>
                      </div>
                      
                      <div className="flex gap-3">
                        <button
                          onClick={deleteSelected}
                          className={`px-6 py-3 border border-red-500/60 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${selectedIds.size === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-500/10'}`}
                          disabled={selectedIds.size === 0}
                        >
                          <Trash2 className="w-4 h-4" />
                          선택 삭제
                        </button>
                        <button
                          onClick={clearAccumulated}
                          className="px-6 py-3 border border-white/20 rounded-xl font-bold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                          전체 삭제
                        </button>
                        <button
                          onClick={exportToExcel}
                          className="px-8 py-3 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                        >
                          <Download className="w-4 h-4" />
                          엑셀 다운로드 (.xlsx)
                        </button>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#141414]/10">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-[#141414] text-base">
                          <colgroup>
                            <col /> {/* NO */}
                            <col /> {/* 보고서 번호 */}
                            <col /> {/* 기관명 */}
                            <col /> {/* 보고서 종류 */}
                            <col /> {/* 주요 기술 */}
                            <col /> {/* 시험성적서 날짜 */}
                            {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
                              .filter(key => !['created_at','Metrics','EQ','companyName','gubun_code','Report_No'].includes(key))
                              .map((key, idx) => (
                                <col key={key} />
                              ))}
                          </colgroup>
                          <thead>
                            <tr className="bg-[#2563eb]/10 border-b border-[#2563eb]/30">
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">
                                <input
                                  type="checkbox"
                                  checked={filteredResults.length > 0 && filteredResults.every(r => selectedIds.has(r.id))}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      setSelectedIds(new Set(filteredResults.map(r => r.id)));
                                    } else {
                                      setSelectedIds(new Set());
                                    }
                                  }}
                                />
                              </th>
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">NO</th>
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">보고서 번호</th>
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">기관명</th>
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">보고서 종류</th>
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">발급 일자</th>
                              <th className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 text-left">시험성적서 날짜</th>
                              {(Object.entries(FIELD_LABELS)
                                .filter(([key]) => !['created_at','Metrics','EQ','companyName','gubun_code','Report_No'].includes(key))
                                .map(([key, label], idx) => (
                                  <th key={label} className="p-4 text-[11px] tracking-wider font-bold text-[#141414]/60 bg-[#141414]/5 border-r border-[#141414]/10 last:border-r-0 text-left">
                                    {label}
                                  </th>
                                )))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#141414]/10">
                            {filteredResults.map((row, idx) => (
                              <tr key={row.id} className="hover:bg-[#141414]/5 transition-colors group">
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">
                                  <input
                                    type="checkbox"
                                    checked={selectedIds.has(row.id)}
                                    onChange={e => {
                                      setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(row.id);
                                        else next.delete(row.id);
                                        return next;
                                      });
                                    }}
                                  />
                                </td>
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{idx + 1}</td>
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{row.Report_No || '-'}</td>
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">{row.companyName || '-'}</td>
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">
                                  {(() => {
                                    const aiKeywords = [
                                      'AI', 'ai', '인공지능', '딥러닝', '머신러닝', '생성형', '예측', '추천', 'classification', 'vision', 'nlp', '자연어', '음성', 'f1', '정확도', '모델', '딥러닝', '신경망', 'transformer', 'gpt', 'llm', '생성', '분류', '탐지', '군집', '회귀', '예측', '추천', 'summarization', '요약', 'translation', '번역', '음성', 'audio', 'speech', '시계열', 'forecast', 'prediction'
                                    ];
                                    const text = `${row.AI_Tech || ''} ${row.AI_Domain || ''} ${row.mainTechField || ''} ${row.productName || ''} ${row.Test_Item || ''}`.toLowerCase();
                                    return aiKeywords.some(k => text.includes(k.toLowerCase())) ? 'AI' : '일반 SW';
                                  })()}
                                </td>
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">
                                  {row.created_at ? new Date(row.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'}
                                </td>
                                <td className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 align-top">
                                  {(() => {
                                    const techMap = [
                                      { label: '교육', keywords: ['교육', 'education', '학습', 'e-learning', '강의', '수업'] },
                                      { label: '대시보드', keywords: ['대시보드', 'dashboard', '시각화', 'visualization', '모니터링'] },
                                      { label: '관리', keywords: ['관리', 'management', '운영', 'admin', '관리자', '통제'] },
                                      { label: '예측', keywords: ['예측', 'prediction', 'forecast', '시계열', '미래', '추정'] },
                                      { label: '추천', keywords: ['추천', 'recommend', 'personalization', '추천시스템'] },
                                      { label: '생성형', keywords: ['생성', 'generation', '생성형', 'gpt', 'llm', '요약', 'summarization', '번역', 'translation'] },
                                      { label: '분류', keywords: ['분류', 'classification', 'classify'] },
                                      { label: '탐지', keywords: ['탐지', 'detection', 'detect', '이상', 'anomaly', 'fraud'] },
                                      { label: '군집', keywords: ['군집', 'clustering', 'cluster'] },
                                      { label: '회귀', keywords: ['회귀', 'regression'] },
                                      { label: '음성', keywords: ['음성', 'speech', 'audio'] },
                                      { label: '자연어', keywords: ['자연어', 'nlp', 'text', '문자', '문서'] },
                                      { label: '로보틱스', keywords: ['로봇', 'robot', '제어', 'control', 'autonomous', '자율'] },
                                    ];
                                    const text = `${row.Test_Item || ''}`.toLowerCase();
                                    const found = techMap.filter(t => t.keywords.some(k => text.includes(k.toLowerCase()))).map(t => t.label);
                                    return found.length > 0 ? found.join(', ') : '-';
                                  })()}
                                </td>
                                {(Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[])
                                  .filter(key => !['created_at','Metrics','EQ','companyName','gubun_code','Report_No'].includes(key))
                                  .map((key, colIdx) => (
                                    <td key={key} className="p-4 text-xs leading-relaxed border-r border-[#141414]/10 last:border-r-0 align-top">
                                      <div className="whitespace-pre-wrap">
                                        {key === 'testResult' && row[key]
                                          ? String(row[key]).replace(/[()]/g, '')
                                          : row[key] || "-"}
                                      </div>
                                    </td>
                                  ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="min-h-100 border-2 border-dashed border-[#141414]/10 rounded-3xl flex flex-col items-center justify-center text-[#141414]/30 gap-6">
                    <Database className="w-20 h-20 opacity-10" />
                    <div className="text-center">
                      <p className="font-serif italic text-2xl mb-2">누적된 데이터가 없습니다.</p>
                      <p className="text-sm">성적서 분석 페이지에서 결과를 누적해 보세요.</p>
                    </div>
                    <button
                      onClick={() => setActiveTab('analyze')}
                      className="px-8 py-3 bg-[#141414] text-white rounded-xl font-bold hover:scale-105 transition-all"
                    >
                      분석하러 가기
                    </button>
                  </div>
                )}
              </motion.div>
            ) : activeTab === 'summary' ? (
              <motion.div
                key="summary"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <AnalysisSummary results={results} accumulatedResults={accumulatedResults} />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-[#141414]/10 text-[10px] uppercase tracking-[0.2em] text-[#141414]/40 flex justify-between items-center">
          <span className="text-[#1e3a8a]/60">© 2026 Test Report Intelligence System</span>
          <span className="text-[#1e3a8a]/60">Powered by Gemini 1.5 Flash</span>
        </footer>
      </div>
    </div>
  );
}

// --- 분석결과 요약 컴포넌트 ---
type AnalysisSummaryProps = {
  results: AnalysisResult[] | null;
  accumulatedResults: AnalysisResult[];
};

function AnalysisSummary({ results, accumulatedResults }: AnalysisSummaryProps) {
    // 대표 도메인별 시험성적서 수 집계
    const domainStats = React.useMemo(() => {
      const map: Record<string, number> = {};
      accumulatedResults.forEach(r => {
        const domain = r.representativeDomain || '기타';
        map[domain] = (map[domain] || 0) + 1;
      });
      return map;
    }, [accumulatedResults]);

    // Pie chart data for 대표 도메인
    const domainLabels = Object.keys(domainStats);
    const domainData = domainLabels.map(label => domainStats[label]);
    const domainChartData = {
      labels: domainLabels,
      datasets: [
        {
          data: domainData,
          backgroundColor: [
            '#2563eb', '#1e3a8a', '#a8c3ff', '#f59e42', '#10b981', '#f43f5e', '#6366f1', '#fbbf24', '#14b8a6', '#64748b', '#eab308', '#f472b6', '#a21caf', '#0ea5e9', '#e11d48', '#84cc16', '#facc15', '#f87171', '#a3e635', '#fcd34d'
          ]
        }
      ]
    };

    // 주요기술 분야별 시험성적서 수 집계
    const techStats = React.useMemo(() => {
      const map: Record<string, number> = {};
      accumulatedResults.forEach(r => {
        const tech = r.mainTechField || '기타';
        map[tech] = (map[tech] || 0) + 1;
      });
      return map;
    }, [accumulatedResults]);

    // Pie chart data for 주요기술 분야
    const techLabels = Object.keys(techStats);
    const techData = techLabels.map(label => techStats[label]);
    const techChartData = {
      labels: techLabels,
      datasets: [
        {
          data: techData,
          backgroundColor: [
            '#10b981', '#6366f1', '#f59e42', '#2563eb', '#a8c3ff', '#1e3a8a', '#f43f5e', '#fbbf24', '#14b8a6', '#64748b', '#eab308', '#f472b6', '#a21caf', '#0ea5e9', '#e11d48', '#84cc16', '#facc15', '#f87171', '#a3e635', '#fcd34d'
          ]
        }
      ]
    };
  // 예시: 최근 분석 결과와 누적 데이터의 간단한 통계
  const recentCount = results?.length || 0;
  const accumulatedCount = accumulatedResults.length;

  // 년도별/월별 시험성적서 갯수 집계
  const yearMonthStats = React.useMemo(() => {
    const yearMap: Record<string, number> = {};
    const monthMap: Record<string, number> = {};
    accumulatedResults.forEach(r => {
      if (!r.created_at) return;
      const date = new Date(r.created_at);
      const year = date.getFullYear().toString();
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      yearMap[year] = (yearMap[year] || 0) + 1;
      monthMap[month] = (monthMap[month] || 0) + 1;
    });
    return { yearMap, monthMap };
  }, [accumulatedResults]);

  // Bar chart data for year (2000~현재까지 모두 표시)
  const currentYear = new Date().getFullYear();
  const yearLabels = Array.from({ length: currentYear - 2021 + 1 }, (_, i) => (2021 + i).toString());
  const yearData = yearLabels.map(y => yearMonthStats.yearMap[y] || 0);
  const yearChartData = {
    labels: yearLabels,
    datasets: [
      {
        label: '년도별 시험성적서 수',
        data: yearData,
        backgroundColor: 'rgba(37, 99, 235, 0.7)'
      }
    ]
  };
  const yearChartOptions = {
    indexAxis: 'y' as const, // horizontal bar chart
    plugins: { legend: { display: false } },
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        min: 0,
        max: 200,
        ticks: {
          stepSize: 10
        },
        title: {
          display: true,
          text: '시험성적서 수'
        }
      },
      y: {
        title: {
          display: true,
          text: '년도'
        }
      }
    }
  };

  // Bar chart data for month (최근 1년)
  // 최근 12개월(데이터 없는 달 포함) 라벨 생성
  const now = new Date();
  const last12MonthLabels = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const last12MonthData = last12MonthLabels.map(m => yearMonthStats.monthMap[m] || 0);
  const monthChartData = {
    labels: last12MonthLabels,
    datasets: [
      {
        label: '월별 시험성적서 수',
        data: last12MonthData,
        backgroundColor: 'rgba(30, 58, 138, 0.7)'
      }
    ]
  };
  const monthChartOptions = {
    indexAxis: 'x' as const, // vertical bar chart
    plugins: { legend: { display: false } },
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        min: 0,
        max: 200,
        ticks: {
          stepSize: 10
        },
        title: {
          display: true,
          text: '시험성적서 수'
        }
      },
      x: {
        title: {
          display: true,
          text: '월'
        }
      }
    }
  };
  // 년도별-월별 매트릭스 데이터 생성 (행: 년도, 열: 월)
  const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'
  ];
  // 각 셀: [년도][월]별 카운트
  const matrix = yearLabels.map((y) =>
    monthNames.map((_, mIdx) => {
      const key = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
      return yearMonthStats.monthMap[key] || 0;
    })
  );
  // 년도별 합계
  const yearTotals = matrix.map(row => row.reduce((a, b) => a + b, 0));
  // 월별 합계
  const monthTotals = monthNames.map((_, mIdx) => matrix.reduce((sum, row) => sum + row[mIdx], 0));
  // 전체 합계
  const grandTotal = yearTotals.reduce((a, b) => a + b, 0);

  return (
    <div>
            {/* 년도별-월별 시험성적서 수 표 (행: 년도, 열: 월) */}
            <div className="mt-8 bg-[#f3f6fd] rounded-xl p-6 overflow-x-auto"> 
              <table className="w-full text-center border-collapse text-[#141414] text-base border border-[#2563eb]/40">
                <thead>
                  <tr>
                    <th className="p-1 border-[#2563eb]/40 bg-[#ffffff]">년도/월</th>
                    {monthNames.map((m) => (
                      <th key={m} className="p-1 border border-[#2563eb]/40 bg-[#afc7fa] font-normal">{m}</th>
                    ))}
                    <th className="p-1 border border-[#2563eb]/40 bg-[#afc7fa] font-normal">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {yearLabels.map((y, yIdx) => (
                    <tr key={y}>
                      <td className="p-1 border border-[#2563eb]/40 bg-[#afc7fa] font-normal">{y}</td>
                      {matrix[yIdx].map((v, mIdx) => (
                        <td key={monthNames[mIdx]} className="p-1 border border-[#2563eb]/40">{v}</td>
                      ))}
                      <td className="p-1 border border-[#2563eb]/40">{yearTotals[yIdx]}</td>
                    </tr>
                  ))}
                  {/* 마지막 행: 월별 합계 및 전체 합계 */}
                  <tr>
                    <td className="p-1 border border-[#2563eb]/40 bg-[#afc7fa] font-normal">합계</td>
                    {monthTotals.map((v, mIdx) => (
                      <td key={monthNames[mIdx]} className="p-1 border border-[#2563eb]/40">{v}</td>
                    ))}
                    <td className="p-1 border border-[#2563eb]/40">{grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#f3f6fd] rounded-xl p-6" style={{overflowY:'auto', maxHeight: 400, minWidth:0}}>
          <h3 className="text-lg font-bold mb-2 text-[#1e3a8a]">년도별</h3>
          <div style={{minWidth: '10%'}}>
            <Bar data={yearChartData} options={yearChartOptions} height={300} />
          </div>
        </div>
        {/* 월별 */}
        <div className="bg-[#f3f6fd] rounded-xl p-6" style={{overflowY:'auto', maxHeight: 400, minWidth:0}}>
          <h3 className="text-lg font-bold mb-2 text-[#1e3a8a]">월별</h3>
          <div style={{minWidth: '60%'}}>
            <Bar data={monthChartData} options={monthChartOptions} height={300} />
          </div>
        </div>
      </div>
      {/* 대표 도메인별/주요기술 분야별 원형 그래프 (나란히) */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 대표 도메인별 */}
        <div className="bg-[#f3f6fd] rounded-xl p-6 flex flex-col items-center w-full">
          <h3 className="text-lg font-bold mb-2 text-[#1e3a8a]">대표 도메인별</h3>
          <div style={{width: 320, height: 320}}>
            <Pie
              data={domainChartData}
              options={
                {
                  plugins: {
                    legend: { display: true, position: 'bottom', labels: { font: { size: 16, weight: 'bold' }, color: '#1e3a8a' } },
                    datalabels: {
                      display: false
                    },
                  },
                } as any
              }
            />
          </div>
          {/* 표 추가 */}
          <div className="w-full mt-6 overflow-x-auto">
            {/* 도메인 데이터와 라벨을 내림차순 정렬하여 순위 부여 */}
            {(() => {
              const domainTableData = domainLabels.map((label, idx) => ({
                label,
                count: domainData[idx],
              }));
              const sorted = [...domainTableData].sort((a, b) => b.count - a.count);
              return (
                <table className="w-auto mx-auto text-center border-collapse text-[#141414] text-base border border-[#2563eb]/40 bg-white rounded-xl shadow">
                  <thead>
                    <tr>
                      <th className="p-2 border border-[#2563eb]/40 bg-[#afc7fa] font-bold">순위</th>
                      <th className="p-2 border border-[#2563eb]/40 bg-[#afc7fa] font-bold">대표 도메인</th>
                      <th className="p-2 border border-[#2563eb]/40 bg-[#afc7fa] font-bold">시험성적서 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, idx) => (
                      <tr key={row.label}>
                        <td className="p-2 border border-[#2563eb]/40">{idx + 1}</td>
                        <td className="p-2 border border-[#2563eb]/40">{row.label}</td>
                        <td className="p-2 border border-[#2563eb]/40">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
        {/* 주요기술 분야별 */}
        <div className="bg-[#f3f6fd] rounded-xl p-6 flex flex-col items-center w-full">
          <h3 className="text-lg font-bold mb-2 text-[#1e3a8a]">주요기술 분야별</h3>
          <div style={{width: 320, height: 320}}>
            <Pie
              data={techChartData}
              options={
                {
                  plugins: {
                    legend: { display: true, position: 'bottom', labels: { font: { size: 16, weight: 'bold' }, color: '#1e3a8a' } },
                    datalabels: {
                      display: false
                    },
                  },
                } as any
              }
            />
          </div>
          {/* 표 추가: 주요기술 분야별 순위 */}
          <div className="w-full mt-6 overflow-x-auto">
            {(() => {
              const fieldTableData = techLabels.map((label: string, idx: number) => ({
                label,
                count: techData[idx],
              }));
              const sorted = [...fieldTableData].sort((a, b) => b.count - a.count);
              return (
                <table className="w-auto mx-auto text-center border-collapse text-[#141414] text-base border border-[#2563eb]/40 bg-white rounded-xl shadow">
                  <thead>
                    <tr>
                      <th className="p-2 border border-[#2563eb]/40 bg-[#afc7fa] font-bold">순위</th>
                      <th className="p-2 border border-[#2563eb]/40 bg-[#afc7fa] font-bold">주요기술 분야</th>
                      <th className="p-2 border border-[#2563eb]/40 bg-[#afc7fa] font-bold">시험성적서 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((row, idx) => (
                      <tr key={row.label}>
                        <td className="p-2 border border-[#2563eb]/40">{idx + 1}</td>
                        <td className="p-2 border border-[#2563eb]/40">{row.label}</td>
                        <td className="p-2 border border-[#2563eb]/40">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </div>
      {/* 추가 통계/차트/분석 결과 등 확장 가능 */}
    </div>
  );
}
