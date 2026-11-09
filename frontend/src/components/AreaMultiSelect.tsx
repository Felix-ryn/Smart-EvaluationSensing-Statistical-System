import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";

interface Area {
  id: string;
  name: string;
}

interface AreaMultiSelectProps {
  areas: Area[];
  selectedAreas: string[];
  onChange: (selected: string[]) => void;
  label?: string;
}

export function AreaMultiSelect({
  areas,
  selectedAreas,
  onChange,
  label = "Area Parkir",
}: AreaMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggleArea = (areaId: string) => {
    const updated = selectedAreas.includes(areaId)
      ? selectedAreas.filter((id) => id !== areaId)
      : [...selectedAreas, areaId];
    onChange(updated);
  };

  const handleSelectAll = () => {
    if (selectedAreas.length === areas.length) {
      onChange([]);
    } else {
      onChange(areas.map((a) => a.id));
    }
  };

  const handleRemoveTag = (areaId: string) => {
    onChange(selectedAreas.filter((id) => id !== areaId));
  };

  const selectedAreaNames = areas
    .filter((a) => selectedAreas.includes(a.id))
    .map((a) => a.name);

  const allSelected = selectedAreas.length === areas.length;

  return (
    <div ref={containerRef} className="area-multi-select" style={{ position: "relative" }}>
      <label className="form-label">{label}</label>

      {/* Display Selected Tags */}
      <div
        className="area-select-display"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "6px",
          minHeight: "40px",
          padding: "8px 12px",
          border: "1px solid #D1D5DB",
          borderRadius: "6px",
          backgroundColor: "#fff",
          cursor: "pointer",
          transition: "border-color 0.2s",
          borderColor: isOpen ? "#19B79A" : "#D1D5DB",
        }}
      >
        {selectedAreaNames.length === 0 ? (
          <span style={{ color: "#9CA3AF" }}>Pilih area...</span>
        ) : selectedAreaNames.length > 2 ? (
          <>
            {selectedAreaNames.slice(0, 2).map((name, idx) => (
              <span
                key={idx}
                className="area-tag"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "4px 8px",
                  backgroundColor: "#E0F2F1",
                  color: "#00695C",
                  borderRadius: "4px",
                  fontSize: "12px",
                  fontWeight: "500",
                }}
              >
                {name}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveTag(areas.find((a) => a.name === name)?.id || "");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <span
              style={{
                display: "inline-block",
                padding: "4px 8px",
                backgroundColor: "#19B79A",
                color: "#fff",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "600",
              }}
            >
              +{selectedAreaNames.length - 2} lagi
            </span>
          </>
        ) : (
          selectedAreaNames.map((name, idx) => (
            <span
              key={idx}
              className="area-tag"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "4px 8px",
                backgroundColor: "#E0F2F1",
                color: "#00695C",
                borderRadius: "4px",
                fontSize: "12px",
                fontWeight: "500",
              }}
            >
              {name}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveTag(areas.find((a) => a.name === name)?.id || "");
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center" }}>
          <ChevronDown size={18} style={{ color: "#6B7280", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }} />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          className="area-select-dropdown"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "#fff",
            border: "1px solid #D1D5DB",
            borderRadius: "6px",
            boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
            zIndex: 1000,
            maxHeight: "300px",
            overflowY: "auto",
          }}
        >
          {/* Select All / Deselect All */}
          <div
            style={{
              padding: "12px",
              borderBottom: "1px solid #E5E7EB",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              cursor: "pointer",
              backgroundColor: "#F9FAFB",
            }}
            onClick={handleSelectAll}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => {}}
              style={{
                cursor: "pointer",
                width: "18px",
                height: "18px",
                accentColor: "#19B79A",
              }}
            />
            <label style={{ cursor: "pointer", flex: 1, fontWeight: "600", fontSize: "14px" }}>
              {allSelected ? "Hapus Semua" : "Pilih Semua"}
            </label>
          </div>

          {/* Area Options */}
          {areas.map((area) => (
            <div
              key={area.id}
              style={{
                padding: "12px",
                borderBottom: "1px solid #E5E7EB",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                cursor: "pointer",
                backgroundColor: selectedAreas.includes(area.id) ? "#F0FDF4" : "#fff",
                transition: "background-color 0.15s",
              }}
              onClick={() => handleToggleArea(area.id)}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = selectedAreas.includes(area.id)
                  ? "#DCFCE7"
                  : "#F3F4F6";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = selectedAreas.includes(area.id)
                  ? "#F0FDF4"
                  : "#fff";
              }}
            >
              <input
                type="checkbox"
                checked={selectedAreas.includes(area.id)}
                onChange={() => {}}
                style={{
                  cursor: "pointer",
                  width: "18px",
                  height: "18px",
                  accentColor: "#19B79A",
                }}
              />
              <label
                style={{
                  cursor: "pointer",
                  flex: 1,
                  fontSize: "14px",
                  fontWeight: selectedAreas.includes(area.id) ? "600" : "400",
                  color: selectedAreas.includes(area.id) ? "#00695C" : "#374151",
                }}
              >
                {area.name}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
