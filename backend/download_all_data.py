import os
from datetime import datetime, timedelta
from gee_extraction import run_cvip_pipeline

def run_mass_download():
    print("============================================================")
    print("  MASS DATASET DOWNLOAD (Past 24 Months)")
    print("============================================================")
    
    import gee_extraction
    
    current_date = datetime.now()
    
    for i in range(24):
        target_date = current_date - timedelta(days=30 * i)
        
        # Override the current time the script "thinks" it is
        class MockDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return target_date
        
        gee_extraction.datetime = MockDatetime
        
        folder_name = target_date.strftime('%Y_%m')
        
        print(f"\n[Extraction {i+1}/24] Pulling data for {target_date.strftime('%B %Y')}...")
        gee_extraction.run_cvip_pipeline(
            days_window=30,
            patch_size=64,
            output_dir=f'data/cvip_output/{folder_name}'
        )
        
        # Also convert them to PNG
        from export_images import convert_npy_to_png
        convert_npy_to_png(
            patches_dir=f'data/cvip_output/{folder_name}/patches',
            output_dir=f'data/cvip_output/{folder_name}/patches_png'
        )
        
    print("\nAll 24 months downloaded successfully!")

if __name__ == "__main__":
    run_mass_download()
