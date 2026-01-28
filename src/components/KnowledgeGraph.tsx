import { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

// Initial Mock data (Empty)
const INITIAL_GRAPH = {
    nodes: [],
    links: []
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const KnowledgeGraph = ({ data }: { data: any }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fgRef = useRef<any>(undefined);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight
                });
            }
        };

        // Initial measurement
        updateDimensions();

        // Resize observer
        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) observer.observe(containerRef.current);

        return () => observer.disconnect();
    }, []);

    // Fallback to empty if no data & Memoize to prevent re-renders
    const chartData = useMemo(() => {
        return data && data.nodes && data.nodes.length > 0 ? data : INITIAL_GRAPH;
    }, [data]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
            {chartData.nodes.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-500 italic text-xs">
                    Graph Waiting for Analysis...
                </div>
            ) : (
                <ForceGraph2D
                    ref={fgRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={chartData}
                    nodeLabel="id"
                    nodeColor={() => '#3b82f6'}
                    linkColor={() => 'rgba(255,255,255,0.1)'}
                    backgroundColor="rgba(0,0,0,0)"
                    cooldownTicks={100}
                    onEngineStop={() => {
                        // Optional: fit bounds once settled
                        if (fgRef.current) {
                            // @ts-ignore
                            fgRef.current.zoomToFit(400);
                        }
                    }}
                    nodeCanvasObject={(node, ctx, globalScale) => {
                        const label = node.id as string;
                        const fontSize = 12 / globalScale;
                        ctx.font = `${fontSize}px Sans-Serif`;
                        const textWidth = ctx.measureText(label).width;
                        const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2); // some padding

                        // Optimized Glow Bubble (simpler shadow)
                        ctx.shadowColor = '#3b82f6';
                        ctx.shadowBlur = 10;
                        ctx.fillStyle = '#3b82f6';
                        ctx.beginPath();
                        ctx.arc(node.x!, node.y!, 5, 0, 2 * Math.PI, false);
                        ctx.fill();

                        // Text
                        ctx.shadowBlur = 0;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                        ctx.fillText(label, node.x!, node.y! + 8); // moved text slightly closer

                        node.__bckgDimensions = bckgDimensions; // to re-use in nodePointerAreaPaint
                    }}
                />
            )}
        </div>
    );
};
