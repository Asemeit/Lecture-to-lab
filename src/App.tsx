import { useState, useRef, useEffect } from 'react';
import ReactPlayer from 'react-player';
import { Maximize, Brain, CheckCircle, Circle, Sparkles, X, Loader2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { GhostOverlay } from './components/GhostOverlay';
import { analyzeContent } from './services/GeminiAnalyzer';
import { KnowledgeGraph } from './components/KnowledgeGraph';

// Initial Demo Data
const INITIAL_STEPS = [
  { time: 0, title: 'Introduction', completed: true, code: null },
  { time: 10, title: 'Project Setup', completed: true, code: 'npm create vite@latest my-app -- --template react-ts\ncd my-app\nnpm install' },
  {
    time: 65,
    title: 'Define Routes',
    completed: false,
    code: `import { BrowserRouter, Route, Routes } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </BrowserRouter>
  );
}`
  },
  {
    time: 120,
    title: 'React Hooks',
    completed: false,
    code: `const [count, setCount] = useState(0);

useEffect(() => {
  document.title = \`Count: \${count}\`;
}, [count]);`
  },
  { time: 180, title: 'State Management', completed: false, code: null },
];

function App() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [playing, _setPlaying] = useState(false);
  const [cinemaMode, setCinemaMode] = useState(false);
  const [videoUrl, setVideoUrl] = useState("https://www.youtube.com/watch?v=k3Vfj-e1Ma4");

  // AI State
  const [steps, setSteps] = useState(INITIAL_STEPS);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [graphData, setGraphData] = useState<any>({ nodes: [], links: [] });

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalyzeModal, setShowAnalyzeModal] = useState(false);
  const [transcriptInput, setTranscriptInput] = useState("");
  const [fileInput, setFileInput] = useState<File | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_currentTime, setCurrentTime] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [activeStep, setActiveStep] = useState(0);

  // Ghost Code State
  const [ghostCode, setGhostCode] = useState('');
  const [showGhost, setShowGhost] = useState(false);

  const [videoTitle, setVideoTitle] = useState("React Tutorial (Demo)");

  // Persistence: Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem('lecture-lab-data');
    if (savedData) {
      try {
        const { steps: savedSteps, graph: savedGraph, url: savedUrl, title: savedTitle } = JSON.parse(savedData);
        if (savedSteps) setSteps(savedSteps);
        if (savedGraph) setGraphData(savedGraph);
        if (savedUrl) setVideoUrl(savedUrl);
        if (savedTitle) setVideoTitle(savedTitle);
        console.log("Loaded saved session from LocalStorage");
      } catch (e) {
        console.error("Failed to parse local storage data", e);
      }
    }
  }, []);

  // Persistence: Save data to localStorage on change
  useEffect(() => {
    // debounced save could be better, but this is fine for now
    const dataToSave = {
      steps,
      graph: graphData,
      url: videoUrl,
      title: videoTitle
    };
    localStorage.setItem('lecture-lab-data', JSON.stringify(dataToSave));
  }, [steps, graphData, videoUrl, videoTitle]);


  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleProgress = (state: any) => {
    const t = state.playedSeconds;
    setCurrentTime(t);

    // Bi-directional Sync: Find the active step based on time
    const currentIdx = steps.findIndex((step, index) => {
      const nextStep = steps[index + 1];
      return t >= step.time && (!nextStep || t < nextStep.time);
    });

    if (currentIdx !== -1 && currentIdx !== activeStep) {
      setActiveStep(currentIdx);

      // Update Ghost Code based on the new step
      const step = steps[currentIdx];
      if (step.code) {
        setGhostCode(step.code);
        setShowGhost(true);
      } else {
        setShowGhost(false);
      }
    }
  };

  const handleExport = () => {
    const markdownContent = `# Analysis: ${videoUrl}\n\n` +
      steps.map(s => `## ${s.time}s - ${s.title}\n${s.completed ? '[x]' : '[ ]'} ${s.title}\n\n${s.code ? '```jsx\n' + s.code + '\n```' : ''}`).join('\n\n');
    
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lecture-notes.md';
    a.click();
  };

  // ... (handleProgress, handleExport)

  const handleAnalyze = async () => {
    if (!transcriptInput && !fileInput) return;
    setIsAnalyzing(true);
    try {
      const input = fileInput || transcriptInput;

      // 1. If user uploaded a file, play it in the player!
      if (fileInput) {
        const objectUrl = URL.createObjectURL(fileInput);
        setVideoUrl(objectUrl);
      } else if (typeof input === 'string') {
         // Auto-Sync: If input looks like a YT URL, update the main player
         const youtubeRegex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:watch\?v=)?(.+)/;
         if (input.match(youtubeRegex)) {
            setVideoUrl(input);
         }
      }

      const data = await analyzeContent(input);
      console.log("AI Data Response:", data);

      if (data.steps) {
        setSteps(data.steps);
        // Ensure graph nodes/links are populated safely
        setGraphData(data.graph || { nodes: [], links: [] });
        
        // Update Title
        if (data.title) {
            setVideoTitle(data.title);
        }

        setShowAnalyzeModal(false);
        setGhostCode("");
        setShowGhost(false);
        setFileInput(null); // Reset file input state

        // Check if we hit the fallback
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((data as any)._errorReason) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          alert(`Analysis Failed (API Error): ${(data as any)._errorReason}\n\nSwitched to Demo Mode (React Tutorial).`);
        } else if (data.title?.includes("Simulated")) {
          alert("⚠️ Analysis Failed (API Error). Switched to Demo Mode (React Tutorial).\n\nCheck console for details.");
        } else {
          alert("Analysis Complete! Timeline & Graph Updated.");
        }
      }
    } catch (e: any) {
      alert(`Analysis Failed: ${e.message}`);
      console.error(e);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className={`min-h-screen bg-background text-white transition-all duration-700 ${cinemaMode ? 'brightness-50' : ''}`}>

      {/* ANALYZE MODAL */}
      <AnimatePresence>
        {showAnalyzeModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <div className="bg-slate-900 border border-white/10 p-6 rounded-2xl w-full max-w-lg shadow-2xl relative">
              <button onClick={() => setShowAnalyzeModal(false)} className="absolute top-4 right-4 text-gray-400 hover:text-white">
                <X size={20} />
              </button>

              <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
                <Sparkles className="text-secondary" size={20} />
                Analyze Content
              </h2>
              <p className="text-xs text-gray-400 mb-4">Paste a YouTube URL, video transcript, or upload a small clip (Max 4.5MB).</p>

              {/* Text Input */}
              <textarea
                className="w-full h-32 bg-black/50 border border-white/10 rounded-lg p-3 text-sm focus:outline-none focus:border-secondary resize-none mb-4"
                placeholder="Paste YouTube URL or transcript here..."
                value={transcriptInput}
                onChange={(e) => setTranscriptInput(e.target.value)}
                disabled={!!fileInput}
              />

              <div className="text-center text-xs text-gray-500 mb-2 font-mono">- OR -</div>

              {/* File Input */}
              <div className="mb-4">
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 4500000) {
                        alert("File too large (>4.5MB). Please use a YouTube URL for long videos.");
                        return;
                      }
                      setFileInput(file);
                    }
                  }}
                  className="w-full text-xs text-slate-400
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-xs file:font-semibold
                      file:bg-secondary/20 file:text-secondary
                      hover:file:bg-secondary/30
                    "
                />
                {fileInput && <div className="text-xs text-green-400 mt-1">Selected: {fileInput.name}</div>}
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isAnalyzing || (!transcriptInput && !fileInput)}
                className="w-full py-3 bg-secondary hover:bg-secondary/80 rounded-lg font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAnalyzing ? <Loader2 className="animate-spin" /> : "Generate Interactive Lab"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className="fixed top-0 w-full z-50 glass-panel border-b border-white/5 h-16 flex items-center px-6 justify-between gap-8">
        <div className="flex items-center gap-2 min-w-fit">
          <Brain className="text-secondary" />
          <span className="font-bold text-lg tracking-wider">Lecture-to-Lab</span>
        </div>

        {/* Search Bar */}
        <div className="flex-1 max-w-2xl relative group flex gap-2">
          <input
            type="text"
            placeholder="Paste YouTube Tutorial URL..."
            className="flex-1 bg-white/5 border border-white/10 rounded-full py-2 px-4 focus:outline-none focus:border-primary/50 text-sm transition-all group-hover:bg-white/10"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />

          <button
            onClick={() => {
              // Auto-fill the modal with the current URL if it's not the default demo
              if (videoUrl && !videoUrl.includes("k3Vfj-e1Ma4")) {
                 setTranscriptInput(videoUrl);
              }
              setShowAnalyzeModal(true);
            }}
            className="bg-secondary/20 hover:bg-secondary/40 text-secondary border border-secondary/50 px-4 rounded-full text-xs font-bold transition-all flex items-center gap-2"
          >
            <Sparkles size={14} />
            ANALYZE
          </button>
        </div>

        {/* Cinema Toggle & Export */}
        <div className="flex items-center gap-3 min-w-fit">
          <button
             onClick={handleExport}
             className="bg-white/5 hover:bg-white/10 text-xs px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-2 transition-all"
             title="Download Notes"
          >
             <Download size={14} className="text-gray-400"/>
             <span className="text-gray-300">Export</span>
          </button>

          <span className="text-xs text-gray-400 font-medium ml-2">Cinema Mode</span>
          <button
            onClick={() => setCinemaMode(!cinemaMode)}
            className={`w-12 h-6 rounded-full p-1 transition-colors duration-300 ${cinemaMode ? 'bg-primary' : 'bg-white/10'}`}
          >
            <div className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-300 ${cinemaMode ? 'translate-x-6' : 'translate-x-0'}`} />
          </button>
        </div>
      </header>

      {/* MAIN GRID */}
      <main className="pt-20 px-6 pb-6 h-screen grid grid-cols-12 gap-6">

        {/* LEFT: TIMELINE (3 cols) */}
        <section className={`col-span-3 flex flex-col gap-4 transition-opacity duration-500 z-10 ${cinemaMode ? 'opacity-20 hover:opacity-100' : ''}`}>
          <h2 className="text-sm uppercase tracking-widest text-gray-400 font-semibold mb-2">Tutorial Timeline</h2>
          <div className="glass-panel rounded-xl p-4 flex-1 overflow-y-auto space-y-3">
            {steps.map((step, idx) => (
              <motion.div
                key={idx}
                className={`p-3 rounded-lg cursor-pointer border transition-all ${idx === activeStep ? 'border-primary bg-primary/10 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'border-transparent hover:bg-white/5'}`}
                onClick={() => {
                  console.log('Clicked step:', idx, step.time);
                  playerRef.current?.seekTo(step.time);
                  setActiveStep(idx);
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-mono ${idx === activeStep ? 'text-primary' : 'text-gray-500'}`}>
                    {new Date(step.time * 1000).toISOString().substr(14, 5)}
                  </span>
                  {/* @ts-ignore */}
                  {step.completed ? <CheckCircle size={14} className="text-green-400" /> : <Circle size={14} className="text-gray-600" />}
                </div>
                <div className="font-medium text-sm">{step.title}</div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CENTER: THEATER (6 cols) */}
        <section className="col-span-6 flex flex-col relative">
          {/* AMBIENT GLOW REMOVED */}

          {/* Video Container - Fixed aspect ratio to prevent stretching */}
          <div className="relative w-full h-auto aspect-video rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-black">
            {/* @ts-ignore: ReactPlayer types are mismatching with ref */}
            {(() => {
              const Player = ReactPlayer as any;
              return (
                <Player
                  ref={playerRef}
                  url={videoUrl}
                  width="100%"
                  height="100%"
                  playing={playing}
                  controls={true}
                  onProgress={handleProgress}
                  style={{ position: 'absolute', top: 0, left: 0 }}
                />
              );
            })()}

            {/* GHOST OVERLAY */}
            <GhostOverlay currentCode={ghostCode} isVisible={showGhost} />
          </div>

          <div className="mt-4 flex justify-between items-center px-2">
            <div>
              <h1 className="text-xl font-bold">{videoTitle || "Untitled Analysis"}</h1>
              <p className="text-gray-400 text-sm">
                 Chapter {activeStep + 1}: {steps[activeStep]?.title || "Loading..."}
              </p>
            </div>
            <button className="p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
              <Maximize size={20} />
            </button>
          </div>
        </section>

        {/* RIGHT: KNOWLEDGE GRAPH (3 cols) */}
        <section className={`col-span-3 flex flex-col gap-4 h-[500px] transition-opacity duration-500 ${cinemaMode ? 'opacity-20 hover:opacity-100' : ''}`}>
          <h2 className="text-sm uppercase tracking-widest text-gray-400 font-semibold mb-2">Knowledge Graph</h2>
          <div className="glass-panel rounded-xl flex-1 relative overflow-hidden">
            <KnowledgeGraph data={graphData} />
            {/* Overlay Info */}
            <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-md p-3 rounded-lg border border-white/10 pointer-events-none">
              <div className="text-xs text-primary mb-1">Active Concepts</div>
              <div className="font-bold text-xs">{graphData.nodes.length} Nodes Loaded</div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}

export default App;
