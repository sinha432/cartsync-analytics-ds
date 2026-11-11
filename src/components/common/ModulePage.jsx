
import { ArrowRight } from "lucide-react";

function ModulePage({ title, description, icon: Icon }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-teal-700 font-medium">
          CARTSYNC ANALYTICS / MODULE
        </p>

        <h1 className="text-3xl font-bold text-slate-800 mt-2">
          {title}
        </h1>

        <p className="text-slate-500 mt-2">
          {description}
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
        <Icon size={42} className="mx-auto text-teal-700" />

        <h2 className="text-xl font-semibold mt-5">{title}</h2>

        <p className="text-slate-500 mt-2">
          This module is ready for feature development.
        </p>

        <div className="mt-5 inline-flex items-center gap-2 text-teal-700 font-medium">
          Development in progress <ArrowRight size={17} />
        </div>
      </div>
    </div>
  );
}

export default ModulePage;
