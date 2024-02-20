import Button from "@/layout/Button";
import { Download } from "lucide-react";

interface ExportGraphProps {
  canvas: HTMLCanvasElement | undefined | null;
  filename: string;
}

const ExportGraph: React.FC<ExportGraphProps> = (props) => {
  const { canvas, filename } = props;
  return (
    <Button
      id="save"
      label="Export Graph"
      image={<Download className="mr-3 h-6 w-6" />}
      onClick={() => {
        canvas?.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${filename}.png`;
            a.click();
          }
        });
      }}
    />
  );
};

export default ExportGraph;
