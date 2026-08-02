/**
 * ModeSelector — toggle between Discover, Connect, and Challenge modes.
 *
 * Each mode changes the LLM's system prompt:
 *   - Discover: broad pattern finding across entire knowledge base
 *   - Connect: understand how new info relates to existing knowledge
 *   - Challenge: surface contradictions and weak assumptions
 */
import { useDispatch, useSelector } from "react-redux";
import {
  HiOutlineLightBulb,
  HiOutlineLink,
  HiOutlineShieldExclamation,
} from "react-icons/hi2";
import { setMode } from "../querySlice";
import { useGetQueryModesQuery } from "../queryApi";

const MODE_ICONS = {
  discover:  HiOutlineLightBulb,
  connect:   HiOutlineLink,
  challenge: HiOutlineShieldExclamation,
};

const MODE_COLORS = {
  discover:  { active: "bg-brand-500/15 border-brand-500/30 text-brand-400", icon: "text-brand-400" },
  connect:   { active: "bg-accent-purple/15 border-accent-purple/30 text-accent-purple", icon: "text-accent-purple" },
  challenge: { active: "bg-accent-amber/15 border-accent-amber/30 text-accent-amber", icon: "text-accent-amber" },
};

export default function ModeSelector() {
  const dispatch = useDispatch();
  const currentMode = useSelector((s) => s.query.currentMode);
  const { data } = useGetQueryModesQuery();

  // Fallback modes in case the API hasn't loaded yet
  const modes = data?.modes || [
    { value: "discover",  label: "Discover",  description: "Find patterns and themes" },
    { value: "connect",   label: "Connect",   description: "Relate new to existing knowledge" },
    { value: "challenge", label: "Challenge", description: "Surface contradictions" },
  ];

  return (
    <div className="flex gap-2 p-1">
      {modes.map((mode) => {
        const isActive = currentMode === mode.value;
        const Icon = MODE_ICONS[mode.value] || HiOutlineLightBulb;
        const colors = MODE_COLORS[mode.value] || MODE_COLORS.discover;

        return (
          <button
            key={mode.value}
            onClick={() => dispatch(setMode(mode.value))}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
              border transition-all duration-200
              ${isActive
                ? colors.active
                : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]"
              }
            `}
            title={mode.description}
          >
            <Icon className={`w-4 h-4 ${isActive ? colors.icon : ""}`} />
            {mode.label}
          </button>
        );
      })}
    </div>
  );
}
