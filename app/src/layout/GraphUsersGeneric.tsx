import React from "react";
import { IMG_AVATAR_DEFAULT } from "@/drizzle/constants";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { getSearchValidator } from "@/validators/register";
import Cytoscape from "cytoscape";
import CytoscapeComponent from "react-cytoscapejs";
import UserSearchSelect from "@/layout/UserSearchSelect";
import edgehandles from "cytoscape-edgehandles";
import type { z } from "zod";

// register controller in chart.js and ensure the defaults are set
Cytoscape.use(edgehandles);

interface GraphUsersGenericProps {
  nodes: { id: string; label: string; img: string | null }[];
  edges: {
    source: string;
    target: string;
    label: string;
    weight: number;
  }[];
}
const GraphUsersGeneric: React.FC<GraphUsersGenericProps> = (props) => {
  // State
  const localTheme = localStorage.getItem("theme");
  const color = localTheme === "dark" ? "white" : "black";

  // User Searching
  const userSearchSchema = getSearchValidator({ max: 10 });
  const userSearchMethods = useForm<z.infer<typeof userSearchSchema>>({
    resolver: zodResolver(userSearchSchema),
  });
  const highlightIds = userSearchMethods.watch("users", []).map((u) => u.userId);

  // Data
  const maxWeight = Math.max(...props.edges.map((x) => x.weight));
  const elements = [
    ...props.nodes.map((user) => ({ data: user })),
    ...props.edges.map((edge) => ({
      data: { ...edge, weight: (5 * maxWeight) / edge.weight, classes: "autorotate" },
    })),
  ];

  // Render
  return (
    <div className="w-full h-full relative">
      <div className="absolute top-0 w-full z-50">
        <UserSearchSelect
          useFormMethods={userSearchMethods}
          label="Users to highlight"
          showYourself={true}
          maxUsers={10}
        />
      </div>
      <div className="w-full h-full">
        <CytoscapeComponent
          elements={elements}
          layout={{
            name: "cose",
            idealEdgeLength: (edge) => {
              // eslint-disable-next-line
              return edge.data().weight;
            },
            nodeOverlap: 20,
            refresh: 20,
            fit: true,
            padding: 30,
            randomize: true,
            componentSpacing: 100,
            nodeRepulsion: () => 400000,
            edgeElasticity: (edge) => {
              // eslint-disable-next-line
              return edge.data().weight;
            },
            nestingFactor: 5,
            gravity: 80,
            numIter: 1000,
            initialTemp: 200,
            coolingFactor: 0.95,
            minTemp: 1.0,
          }}
          style={{ width: "100%", height: "100%" }}
          stylesheet={[
            {
              selector: "node[name]",
              style: {
                content: "data(name)",
                color: color,
              },
            },
            {
              selector: "edge",
              style: {
                "curve-style": "bezier",
                "target-arrow-shape": "triangle",
                color: color,
              },
            },
            {
              selector: "edge[label]",
              // eslint-disable-next-line
              style: {
                label: "data(label)",
                width: 3,
                edgeTextRotation: "autorotate",
                fontSize: 8,
                color: color,
              } as any,
            },
            {
              selector: "node[label]",
              // eslint-disable-next-line
              style: {
                label: "data(label)",
                fontSize: 8,
                color: color,
              } as any,
            },
            ...props.nodes.map((node) => {
              const highlighted = highlightIds.includes(node.id);
              return {
                selector: `#${node.id}`,
                style: {
                  backgroundImage: node.img || IMG_AVATAR_DEFAULT,
                  backgroundWidth: "100%",
                  backgroundHeight: "100%",
                  shape: "ellipse",
                  width: highlighted ? 60 : 30,
                  height: highlighted ? 60 : 30,
                  borderWidth: highlighted ? 5 : 1,
                  borderColor: highlighted ? "red" : color,
                },
              };
            }),
          ]}
        />
      </div>
    </div>
  );
};

export default React.memo(GraphUsersGeneric);
